# Programming question bank (`edra-dev-v3`)

Original beginner exercises for the development academy, committed as data. Nothing is fetched or generated at run time; `assessments.mjs` selects from these files with keyed draws, so a recipe, seed and reference date fix the content.

| Pack | File | Course | Units, in order |
| --- | --- | --- | --- |
| `foundations` | `foundations.mjs` | Programming Foundations | algorithms and tracing (pseudocode) |
| `javascript` | `javascript.mjs` | JavaScript Basics (Preparatory 3) | values, operators, conditions, loops, functions, arrays |
| `cpp` | `cpp.mjs` | C++ Fundamentals (Secondary 2) | output, types, conditions, loops, functions, arrays and vectors |

Each course has assignment slots (one or more variants each), three paper unit tests and one practice exam. A group's first assignment is a Foundations variant; the rest follow the course's slots. Past the end of a course the sequence repeats with "(revision n)" titles.

## Authoring rules

- `marks` are whole numbers; a part's maximum is the sum of its questions. Assessment totals vary (10 to 100).
- Choice questions list the correct choice first; the builder shuffles per question. Each needs an `explanation` (stored as the model answer) and distinct, plausible distractors. Exactly one choice is correct.
- Code goes in `code`, written with the `code` tag (plain text, two-space indentation, no tabs). It is appended to the prompt after a blank line; the exam and assignment views show prompts as plain pre-wrapped text, so no Markdown or image tokens.
- `output` (or `prints: true`, meaning the first choice) marks a complete runnable snippet. `assessments.test.mjs` runs every JavaScript snippet with Node.js and, when `g++` or `clang++` is on `PATH`, compiles every C++ program with `-std=c++17 -Wall -Wextra -pedantic -Werror` and compares the output.
- Model answers (`answer`, `explanation`) never appear in a prompt.

## Language assumptions

- JavaScript: modern ECMAScript as run by current Node.js, script (CommonJS) context, output with `console.log`. Snippets avoid implicit coercion except where the question is about `+` joining strings.
- C++: ISO C++17, hosted implementation, `<iostream>` output; no undefined, unspecified or implementation-defined behaviour (no overflow, out-of-range access or unsequenced side effects in runnable code). `int` division and `%` follow truncation toward zero; operands are non-negative.

## Sources

Facts were checked against primary references; the exercises themselves are original.

- C++ multiplicative operators (integer division truncates, `%`): https://eel.is/c++draft/expr.mul
- `std::boolalpha` and default `bool` output as `1`/`0`: https://en.cppreference.com/w/cpp/io/manip/boolalpha
- JavaScript remainder `%`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
- JavaScript `typeof`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
- JavaScript addition and string concatenation: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Addition
