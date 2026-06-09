import os
import re
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import anthropic
import sympy as sp

load_dotenv()
app = FastAPI()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-opus-4-6"


# ── Sympy evaluator ───────────────────────────────────────────────────────────

_SYMPY_ENV = {
    "__builtins__": {},
    # symbols
    "x": sp.Symbol("x"),
    "y": sp.Symbol("y"),
    "n": sp.Symbol("n"),
    "t": sp.Symbol("t"),
    # calculus
    "diff":      sp.diff,
    "integrate": sp.integrate,
    "limit":     sp.limit,
    "solve":     sp.solve,
    # trig
    "sin": sp.sin,  "cos": sp.cos,  "tan": sp.tan,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    # algebra / misc
    "sqrt":      sp.sqrt,
    "exp":       sp.exp,
    "log":       sp.log,
    "ln":        sp.log,
    "Abs":       sp.Abs,
    "floor":     sp.floor,
    "ceiling":   sp.ceiling,
    "factorial": sp.factorial,
    "binomial":  sp.binomial,
    "Rational":  sp.Rational,
    "simplify":  sp.simplify,
    "expand":    sp.expand,
    "factor":    sp.factor,
    # constants
    "pi": sp.pi,
    "E":  sp.E,
    "oo": sp.oo,
    # safe Python builtins Claude will use in expressions
    "sorted": sorted,
    "min":    min,
    "max":    max,
    "abs":    sp.Abs,
    "list":   list,
    "len":    len,
    "round":  round,
}

_UNSAFE = re.compile(r'\b(import|exec|eval|open|__)\b')


def _evaluate(expr_str: str) -> str:
    if _UNSAFE.search(expr_str):
        raise ValueError("Unsafe expression rejected")

    result = eval(expr_str, _SYMPY_ENV)  # noqa: S307

    # Normalize to a clean sympy object
    result = sp.nsimplify(result, rational=True, tolerance=1e-9)

    if result.is_integer:
        return str(int(result))

    if result.is_rational:
        return f"{result.p}/{result.q}"

    # Irrational (trig results, roots, etc.) — decimal to 2 places
    f = round(float(result), 2)
    return str(int(f)) if f == int(f) else str(f)


# ── Prompt ────────────────────────────────────────────────────────────────────

_PRACTICE_PROMPT = """\
A student has been working on these math problems:
{problem_list}

Generate 3 new practice problems of similar type and difficulty. \
Respond with ONLY a raw JSON array — no markdown, no explanation.

Each element needs two fields:
  "question"   — the problem statement shown to the student \
(plain text; use ^ for exponents, write trig as sin(x) etc.)
  "sympy_expr" — a Python expression that evaluates to a single \
numerical answer using only the names listed below.

Available names:
  Symbols  : x, y, n, t
  Calculus : diff, integrate, limit, solve
  Trig     : sin, cos, tan, asin, acos, atan, sinh, cosh, tanh
  Algebra  : sqrt, exp, log, ln, Abs, floor, factorial, Rational, \
simplify, expand, factor
  Constants: pi, E, oo

Conventions:
  - solve() returns a list — index it: solve(2*x - 6, x)[0]
  - For the smaller root: min(solve(expr, x), key=abs)  or  sorted(solve(expr, x))[0]
  - Derivative at a point: diff(x**3, x).subs(x, 2)
  - Definite integral:     integrate(x**2, (x, 0, 3))
  - Never use import, exec, eval, open, or __ names

Output format (no other text):
[{{"question":"...","sympy_expr":"..."}}]
"""


# ── Pydantic models ───────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    problem: Optional[str] = None
    messages: list[Message]


class ExtractRequest(BaseModel):
    image_base64: str
    media_type: str


class PracticeRequest(BaseModel):
    recentProblems: list[str]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(req: ChatRequest):
    if req.problem:
        system_text = (
            f"You are a friendly, encouraging math tutor. The student is working on this problem:\n\n"
            f"{req.problem}\n\n"
            "Your role is to guide, not to give answers. Never reveal the final answer or complete solution — "
            "even if the student asks directly. If asked for the answer, redirect them: acknowledge the request, "
            "then offer a targeted hint or ask a guiding question instead. Help them understand by working through "
            "steps, asking leading questions, and explaining underlying concepts."
        )
    else:
        system_text = (
            "You are a friendly math tutor. Help the student with their math questions. "
            "Never give final answers directly — guide them to discover the solution themselves."
        )

    last_assistant_idx = -1
    for i, m in enumerate(req.messages):
        if m.role == "assistant":
            last_assistant_idx = i

    messages_for_api = []
    for i, m in enumerate(req.messages):
        if i == last_assistant_idx:
            messages_for_api.append({
                "role": m.role,
                "content": [{"type": "text", "text": m.content, "cache_control": {"type": "ephemeral"}}],
            })
        else:
            messages_for_api.append({"role": m.role, "content": m.content})

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_text,
            messages=messages_for_api,
        )
        return {"reply": response.content[0].text.strip()}
    except anthropic.APIError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/extract-math")
async def extract_math(req: ExtractRequest):
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": req.media_type,
                            "data": req.image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract the math problem from this image. "
                            "Return only the problem statement as written — do not solve it, explain it, or add any commentary. "
                            "If the image contains no math problem, respond with exactly: NO_PROBLEM_FOUND"
                        ),
                    },
                ],
            }],
        )
        extracted = response.content[0].text.strip()
        if not extracted or extracted == "NO_PROBLEM_FOUND":
            return {"mathProblem": None}
        return {"mathProblem": extracted}
    except anthropic.APIError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/generate-practice")
async def generate_practice(req: PracticeRequest):
    if not req.recentProblems:
        return JSONResponse(status_code=400, content={"error": "No problem history provided."})

    problem_list = "\n".join(f"{i+1}. {p}" for i, p in enumerate(req.recentProblems[:10]))
    prompt = _PRACTICE_PROMPT.format(problem_list=problem_list)

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if not json_match:
            raise ValueError("No JSON array in response")
        raw = json.loads(json_match.group())
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Generation failed: {e}"})

    problems = []
    for p in raw:
        try:
            answer = _evaluate(p["sympy_expr"])
            problems.append({"question": p["question"], "answer": answer})
        except Exception:
            continue  # skip any problem whose expression fails to evaluate

    if not problems:
        return JSONResponse(status_code=500, content={"error": "Could not evaluate any generated problems"})

    return {"problems": problems}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=3001)
