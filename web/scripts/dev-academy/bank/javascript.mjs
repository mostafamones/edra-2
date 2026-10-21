// JavaScript Basics (preparatory groups). Modern JavaScript (ES2015+), run with Node.js or a browser console.
// Snippets only print strings, numbers and booleans, so console output is the same everywhere.
// `output` is the exact console output; on a choice question `prints: true` means the first choice is that output.
// The first choice of every choice question is the correct one; the builder shuffles choices per exam.
import { code } from "./text.mjs";

const INSTRUCTIONS = "Answer on paper. The code is modern JavaScript, as run in a browser console or Node.js.";

export const javascript = {
  id: "javascript",
  course: "JavaScript Basics",
  language: "JavaScript (ES2015+)",
  runtime: "node",
  units: {
    values: "Values, variables and types",
    operators: "Operators and expressions",
    conditions: "Making decisions",
    loops: "Loops",
    functions: "Functions",
    arrays: "Arrays",
  },
  // Assignment slots after the foundations slot; each slot lists its variants.
  assignments: [
    [
      {
        id: "js-values-a",
        unit: "values",
        title: "Variables and values",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 4, prompt: "What does this code print?", code: code`
                let apples = 5;
                apples = apples + 3;
                console.log(apples);
              `, output: "8" },
              { marks: 4, prompt: "What does this code print?", code: code`
                const first = "Edra";
                const last = "Academy";
                console.log(first + " " + last);
              `, output: "Edra Academy" },
              { marks: 4, prompt: "What does this code print?", code: code`
                console.log(typeof 42);
                console.log(typeof "42");
              `, output: "number\nstring" },
            ],
          },
          {
            title: "Explain",
            instructions: "",
            questions: [
              { marks: 4, prompt: "What is the difference between let and const? Give one example of each." },
              { marks: 4, prompt: "This code stops with an error. Explain why, then fix it.", code: code`
                const score = 10;
                score = 12;
              ` },
            ],
          },
        ],
      },
      {
        id: "js-operators-a",
        unit: "operators",
        title: "Operators and expressions",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Work it out",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 6, prompt: "What does this code print?", code: code`
                console.log(7 + 3 * 2);
                console.log((7 + 3) * 2);
              `, output: "13\n20" },
              { marks: 6, prompt: "What does this code print?", code: code`
                console.log(17 % 5);
                console.log(20 % 4);
              `, output: "2\n0" },
              { marks: 6, prompt: "The + operator joins text when one side is a string. What does this code print?", code: code`
                console.log("5" + 3);
                console.log(5 + 3);
              `, output: "53\n8" },
            ],
          },
          {
            title: "Write code",
            instructions: "",
            questions: [
              { marks: 6, prompt: "Write code that stores a price of 120 and a discount of 15, then prints the price after the discount." },
              { marks: 6, prompt: "Write one line that prints true when the number stored in n is even and false otherwise. Use the % operator." },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "js-conditions-a",
        unit: "conditions",
        title: "Making decisions with if",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 5, prompt: "What does this code print?", code: code`
                let temp = 31;
                if (temp > 30) {
                  console.log("Hot");
                } else {
                  console.log("Fine");
                }
              `, output: "Hot" },
              { marks: 5, prompt: "What does this code print?", code: code`
                let mark = 72;
                if (mark >= 90) {
                  console.log("A");
                } else if (mark >= 70) {
                  console.log("B");
                } else {
                  console.log("C");
                }
              `, output: "B" },
              { marks: 5, prompt: "What does this code print?", code: code`
                console.log(5 === 5);
                console.log(5 === "5");
              `, output: "true\nfalse" },
            ],
          },
          {
            title: "Write code",
            instructions: "",
            questions: [
              { marks: 10, prompt: 'The variable age holds a whole number. Write an if / else if / else statement that prints "Child" for ages under 13, "Teen" for 13 to 19 and "Adult" otherwise.' },
            ],
          },
        ],
      },
      {
        id: "js-conditions-b",
        unit: "conditions",
        title: "Logical operators",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 4, prompt: "What does this code print?", code: code`
                const hasTicket = true;
                const isLate = false;
                console.log(hasTicket && !isLate);
              `, output: "true" },
              { marks: 4, prompt: "What does this code print?", code: code`
                const day = "Friday";
                console.log(day === "Friday" || day === "Saturday");
              `, output: "true" },
              { marks: 4, prompt: "What does this code print?", code: code`
                let x = 8;
                if (x > 5 && x < 10) {
                  console.log("inside");
                } else {
                  console.log("outside");
                }
              `, output: "inside" },
            ],
          },
          {
            title: "Find the bug",
            instructions: "",
            questions: [
              { marks: 8, prompt: 'This code should print "Pass" only when score is 50 or more, but it prints "Pass" for every score. Explain the mistake and correct the condition.', code: code`
                let score = 20;
                if (score = 50 || score > 50) {
                  console.log("Pass");
                }
              `, output: "Pass" },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "js-loops-a",
        unit: "loops",
        title: "Counting with for loops",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Trace the loop",
            instructions: "Write exactly what each program prints, one line per output line.",
            questions: [
              { marks: 10, prompt: "What does this code print?", code: code`
                for (let i = 1; i <= 4; i++) {
                  console.log(i * 2);
                }
              `, output: "2\n4\n6\n8" },
              { marks: 10, prompt: "What does this code print?", code: code`
                let total = 0;
                for (let i = 1; i <= 5; i++) {
                  total += i;
                }
                console.log(total);
              `, output: "15" },
              { marks: 10, prompt: "What does this code print?", code: code`
                let count = 0;
                while (count < 3) {
                  console.log("Hi");
                  count++;
                }
              `, output: "Hi\nHi\nHi" },
            ],
          },
          {
            title: "Write a loop",
            instructions: "",
            questions: [
              { marks: 10, prompt: "Write a for loop that prints 10, 8, 6, 4 and 2, in that order." },
              { marks: 10, prompt: "Write a loop that prints the 7 times table from 7 x 1 to 7 x 10, one line each, such as 7 x 3 = 21." },
            ],
          },
        ],
      },
      {
        id: "js-loops-b",
        unit: "loops",
        title: "While loops and counters",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Trace the loop",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 8, prompt: "What does this code print?", code: code`
                let n = 1;
                while (n < 50) {
                  n = n * 3;
                }
                console.log(n);
              `, output: "81" },
              { marks: 8, prompt: "What does this code print?", code: code`
                let text = "";
                for (let i = 0; i < 3; i++) {
                  text += "ab";
                }
                console.log(text);
              `, output: "ababab" },
              { marks: 8, prompt: 'How many times does this loop print "Go"?', code: code`
                for (let i = 10; i > 0; i -= 2) {
                  console.log("Go");
                }
              `, output: "Go\nGo\nGo\nGo\nGo" },
            ],
          },
          {
            title: "Find the bug",
            instructions: "",
            questions: [
              { marks: 16, prompt: "This loop should print 1 to 5, but it never stops. Explain why and fix it.", code: code`
                let i = 1;
                while (i <= 5) {
                  console.log(i);
                }
              ` },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "js-functions-a",
        unit: "functions",
        title: "Writing functions",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 5, prompt: "What does this code print?", code: code`
                function double(n) {
                  return n * 2;
                }
                console.log(double(6));
              `, output: "12" },
              { marks: 5, prompt: "What does this code print?", code: code`
                function greet(name) {
                  return "Hello, " + name + "!";
                }
                console.log(greet("Mona"));
              `, output: "Hello, Mona!" },
              { marks: 5, prompt: "What does this code print?", code: code`
                function area(width, height) {
                  return width * height;
                }
                console.log(area(3, 4) + area(2, 5));
              `, output: "22" },
            ],
          },
          {
            title: "Write functions",
            instructions: "",
            questions: [
              { marks: 7, prompt: "Write a function named isAdult that takes an age and returns true when the age is 18 or more." },
              { marks: 8, prompt: "Write a function largest(a, b) that returns the bigger of two numbers without using Math.max. Show one call and what it prints." },
            ],
          },
        ],
      },
      {
        id: "js-functions-b",
        unit: "functions",
        title: "Parameters and return values",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 3, prompt: "What does this code print?", code: code`
                function square(x) {
                  return x * x;
                }
                console.log(square(3) + 1);
              `, output: "10" },
              { marks: 3, prompt: "What does this code print?", code: code`
                function show(message) {
                  console.log(message);
                }
                show("first");
                show("second");
              `, output: "first\nsecond" },
            ],
          },
          {
            title: "Explain",
            instructions: "",
            questions: [
              { marks: 4, prompt: "Explain the difference between printing a value with console.log inside a function and returning it with return." },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "js-arrays-a",
        unit: "arrays",
        title: "Lists with arrays",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Read the code",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 10, prompt: "What does this code print?", code: code`
                const colors = ["red", "green", "blue"];
                console.log(colors[1]);
                console.log(colors.length);
              `, output: "green\n3" },
              { marks: 10, prompt: "What does this code print?", code: code`
                const nums = [4, 8, 15];
                nums.push(16);
                console.log(nums.length);
                console.log(nums[3]);
              `, output: "4\n16" },
              { marks: 10, prompt: "What does this code print?", code: code`
                const marks = [12, 7, 19];
                let sum = 0;
                for (let i = 0; i < marks.length; i++) {
                  sum += marks[i];
                }
                console.log(sum);
              `, output: "38" },
              { marks: 10, prompt: "What does this code print?", code: code`
                const words = ["code", "is", "fun"];
                console.log(words.join(" "));
              `, output: "code is fun" },
            ],
          },
          {
            title: "Write code",
            instructions: "",
            questions: [
              { marks: 20, prompt: "Write code that uses a loop to find and print the smallest number in the array [9, 4, 11, 2, 7]." },
              { marks: 20, prompt: "Write a function countAbove(list, limit) that returns how many numbers in list are greater than limit." },
              { marks: 20, prompt: 'Explain why the last item of an array is at index length - 1. Use the array ["a", "b", "c"] in your answer.' },
            ],
          },
        ],
      },
    ],
  ],
  // Paper unit tests in order; written answers marked by hand.
  paperExams: [
    {
      id: "js-test-1",
      title: "Unit test 1: values and operators",
      instructions: "Answer every question on the paper provided. Code is modern JavaScript.",
      solutionNotes: "Accept equivalent wording in explanations. Output answers must match exactly, line by line.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 4, prompt: "What does this code print?", code: code`
              let x = 2;
              let y = x * 5;
              x = 7;
              console.log(y);
            `, output: "10", answer: "10. y was calculated when x was 2; changing x later does not change y." },
            { marks: 4, prompt: "What does this code print?", code: code`
              console.log(9 % 4);
              console.log(9 / 4);
            `, output: "1\n2.25", answer: "1, then 2.25. % gives the remainder; / gives the full division result." },
            { marks: 4, prompt: "The + operator works left to right. What does this code print?", code: code`
              console.log("Total: " + 4 + 6);
            `, output: "Total: 46", answer: 'Total: 46. "Total: " + 4 is a string, so 6 is joined as text too.' },
          ],
        },
        {
          title: "Explain",
          instructions: "",
          questions: [
            { marks: 4, prompt: "Name three JavaScript value types and give one example value of each.", answer: 'Any three of: number (42), string ("hi"), boolean (true), undefined, null.' },
            { marks: 4, prompt: "Why is const a good default for values that never change?", answer: "It prevents accidental reassignment: the program stops with an error instead of silently changing the value." },
          ],
        },
      ],
    },
    {
      id: "js-test-2",
      title: "Unit test 2: decisions and loops",
      instructions: "Answer every question on the paper provided. Code is modern JavaScript.",
      solutionNotes: "Award method marks for a correct loop with a small slip in the limits.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 10, prompt: "What does this code print?", code: code`
              let n = 15;
              if (n % 3 === 0 && n % 5 === 0) {
                console.log("FizzBuzz");
              } else if (n % 3 === 0) {
                console.log("Fizz");
              } else {
                console.log(n);
              }
            `, output: "FizzBuzz", answer: "FizzBuzz. 15 is divisible by both 3 and 5, so the first condition is true." },
            { marks: 10, prompt: "What does this code print?", code: code`
              let s = 0;
              for (let i = 1; i < 5; i++) {
                s += i * i;
              }
              console.log(s);
            `, output: "30", answer: "30 = 1 + 4 + 9 + 16. The loop stops before i reaches 5." },
            { marks: 10, prompt: "What does this code print?", code: code`
              let i = 0;
              while (i < 10) {
                i += 4;
              }
              console.log(i);
            `, output: "12", answer: "12. i goes 4, 8, 12; the loop ends when i is no longer below 10." },
          ],
        },
        {
          title: "Write code",
          instructions: "",
          questions: [
            { marks: 20, prompt: "Write a loop that prints every number from 1 to 30 that is divisible by 3 or by 5.", answer: "for (let i = 1; i <= 30; i++) {\n  if (i % 3 === 0 || i % 5 === 0) {\n    console.log(i);\n  }\n}" },
          ],
        },
      ],
    },
    {
      id: "js-test-3",
      title: "Unit test 3: functions and arrays",
      instructions: "Answer every question on the paper provided. Code is modern JavaScript.",
      solutionNotes: "Any correct loop or array method is acceptable in the written function.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 5, prompt: "What does this code print?", code: code`
              function half(n) {
                return n / 2;
              }
              console.log(half(9));
            `, output: "4.5", answer: "4.5. JavaScript division keeps the fraction." },
            { marks: 5, prompt: "What does this code print?", code: code`
              const list = [3, 6, 9];
              console.log(list[0] + list[2]);
            `, output: "12", answer: "12. Index 0 is 3 and index 2 is 9." },
            { marks: 5, prompt: "What does this code print?", code: code`
              function last(items) {
                return items[items.length - 1];
              }
              console.log(last(["x", "y", "z"]));
            `, output: "z", answer: "z. The last index is length - 1, which is 2." },
          ],
        },
        {
          title: "Write a function",
          instructions: "",
          questions: [
            { marks: 15, prompt: "Write a function average(numbers) that returns the average of an array of numbers. Show what average([4, 8, 6]) returns.", answer: "function average(numbers) {\n  let sum = 0;\n  for (const n of numbers) {\n    sum += n;\n  }\n  return sum / numbers.length;\n}\n// average([4, 8, 6]) returns 6" },
          ],
        },
      ],
    },
  ],
  // The online practice exam: choice questions only, so results are scored and announced automatically.
  practiceExam: {
    id: "js-practice",
    title: "JavaScript practice exam: values to loops",
    instructions: "Choose one answer for each question. All code is modern JavaScript.",
    solutionNotes: "Each answer is explained in its model answer.",
    parts: [
      {
        title: "Read the code",
        kind: "question_sheet",
        instructions: "",
        questions: [
          { marks: 2, prompt: "What does this code print?", code: code`
            let a = 4;
            let b = a;
            a = 10;
            console.log(b);
          `, choices: ["4", "10", "a", "undefined"], prints: true, explanation: "b received the number 4. Changing a afterwards does not change b." },
          { marks: 2, prompt: "Which line declares a variable that cannot be reassigned?",
            choices: ["const rate = 5;", "let rate = 5;", "rate == 5;", "var rate;"], explanation: "const creates a binding that cannot be reassigned; let and var can be reassigned, and == only compares." },
          { marks: 2, prompt: "What does this code print?", code: code`
            console.log(typeof "7");
          `, choices: ["string", "number", "text", '"7"'], prints: true, explanation: '"7" is in quotes, so it is a string, and typeof returns the word string.' },
          { marks: 2, prompt: "What does this code print?", code: code`
            console.log(10 - 4 / 2);
          `, choices: ["8", "3", "6", "12"], prints: true, explanation: "Division happens before subtraction: 4 / 2 is 2, and 10 - 2 is 8." },
          { marks: 3, prompt: "What does this code print?", code: code`
            console.log(23 % 4);
          `, choices: ["3", "5", "5.75", "0"], prints: true, explanation: "23 = 4 x 5 + 3, so the remainder is 3." },
          { marks: 3, prompt: "When one side of + is a string, + joins text. What does this code print?", code: code`
            console.log(2 + 3 + "4");
          `, choices: ["54", "234", "9", "2 + 3 + 4"], prints: true, explanation: "+ works left to right: 2 + 3 is the number 5, then 5 + \"4\" joins text to give 54." },
          { marks: 2, prompt: "What does this code print?", code: code`
            let age = 15;
            if (age >= 18) {
              console.log("Adult");
            } else {
              console.log("Minor");
            }
          `, choices: ["Minor", "Adult", "Adult\nMinor", "Nothing is printed"], prints: true, explanation: "15 >= 18 is false, so only the else branch runs." },
          { marks: 3, prompt: "What does this code print?", code: code`
            console.log(3 > 2 && 2 > 5);
          `, choices: ["false", "true", "3", "5"], prints: true, explanation: "&& needs both sides to be true; 2 > 5 is false." },
          { marks: 2, prompt: "Which condition checks that x is the number 10 without converting types?",
            choices: ["x === 10", "x = 10", "x => 10", "x =! 10"], explanation: "=== compares value and type. = assigns, => starts an arrow function and =! assigns the negation." },
          { marks: 3, prompt: "What does this code print?", code: code`
            for (let i = 0; i < 3; i++) {
              console.log(i);
            }
          `, choices: ["0\n1\n2", "1\n2\n3", "0\n1\n2\n3", "3"], prints: true, explanation: "i starts at 0 and the loop stops when i reaches 3, so it prints 0, 1 and 2." },
          { marks: 3, prompt: "What does this code print?", code: code`
            let total = 0;
            for (let i = 2; i <= 6; i += 2) {
              total += i;
            }
            console.log(total);
          `, choices: ["12", "6", "20", "8"], prints: true, explanation: "i takes the values 2, 4 and 6, and 2 + 4 + 6 = 12." },
          { marks: 3, prompt: 'How many times does this loop print "*"?', code: code`
            let n = 5;
            while (n > 1) {
              console.log("*");
              n--;
            }
          `, choices: ["4", "5", "1", "It never stops"], output: "*\n*\n*\n*", explanation: "The body runs for n = 5, 4, 3 and 2, which is 4 times." },
        ],
      },
    ],
  },
};
