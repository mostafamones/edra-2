// C++ Fundamentals (secondary groups). Standard C++17; every runnable program is complete, uses only well-defined
// behaviour and builds with -std=c++17 -Wall -Wextra -pedantic -Werror. Characters rely only on the guaranteed
// contiguous digits '0' to '9'. `output` is the exact standard output; `prints: true` means the first choice is it.
// The first choice of every choice question is the correct one; the builder shuffles choices per exam.
import { code, cpp } from "./text.mjs";

const INSTRUCTIONS = "Answer on paper. All programs are standard C++17.";

export const cplusplus = {
  id: "cpp",
  course: "C++ Fundamentals",
  language: "C++17",
  runtime: "c++17",
  units: {
    output: "Program structure and output",
    types: "Variables, types and arithmetic",
    conditions: "Conditions",
    loops: "Loops",
    functions: "Functions",
    arrays: "Arrays and vectors",
  },
  assignments: [
    [
      {
        id: "cpp-output-a",
        unit: "output",
        title: "Your first C++ programs",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 4, prompt: "What does this program print?", code: cpp(code`
                std::cout << "Score: " << 10 + 5 << '\n';
              `), output: "Score: 15" },
              { marks: 4, prompt: "What does this program print?", code: cpp(code`
                std::cout << "Line 1\n" << "Line 2\n";
              `), output: "Line 1\nLine 2" },
              { marks: 4, prompt: "What does this program print?", code: cpp(code`
                int x = 3;
                x = x * 4;
                std::cout << x << '\n';
              `), output: "12" },
            ],
          },
          {
            title: "Fix the syntax",
            instructions: "",
            questions: [
              { marks: 8, prompt: "This program does not compile. Find the two mistakes and write the corrected program.", code: code`
                #include <iostream>

                int main() {
                  std::cout << "Welcome" << '\n'
                  return 0
                }
              ` },
            ],
          },
        ],
      },
      {
        id: "cpp-types-a",
        unit: "types",
        title: "Integers, decimals and characters",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                int a = 17;
                int b = 5;
                std::cout << a / b << '\n';
                std::cout << a % b << '\n';
              `), output: "3\n2" },
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                double price = 9.5;
                int quantity = 2;
                std::cout << price * quantity << '\n';
              `), output: "19" },
              { marks: 10, prompt: "The digit characters '0' to '9' are stored in order. What does this program print?", code: cpp(code`
                char digit = '7';
                int value = digit - '0';
                std::cout << value + 1 << '\n';
              `), output: "8" },
            ],
          },
          {
            title: "Explain and write",
            instructions: "",
            questions: [
              { marks: 10, prompt: "Explain why 7 / 2 gives 3 in C++ but 7.0 / 2 gives 3.5." },
              { marks: 10, prompt: "Write a program that stores a temperature in Celsius in a double and prints it in Fahrenheit, using F = C * 9 / 5 + 32." },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "cpp-conditions-a",
        unit: "conditions",
        title: "if and else",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                int marks = 64;
                if (marks >= 50) {
                  std::cout << "Pass\n";
                } else {
                  std::cout << "Fail\n";
                }
              `), output: "Pass" },
              { marks: 6, prompt: "In a condition, 0 counts as false and any other number as true. What does this program print?", code: cpp(code`
                int x = 0;
                if (x) {
                  std::cout << "yes\n";
                } else {
                  std::cout << "no\n";
                }
              `), output: "no" },
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                int hour = 14;
                if (hour < 12) {
                  std::cout << "Morning\n";
                } else if (hour < 18) {
                  std::cout << "Afternoon\n";
                } else {
                  std::cout << "Evening\n";
                }
              `), output: "Afternoon" },
            ],
          },
          {
            title: "Write a program",
            instructions: "",
            questions: [
              { marks: 12, prompt: 'Write a program that reads a whole number with std::cin and prints "positive", "negative" or "zero".' },
            ],
          },
        ],
      },
      {
        id: "cpp-conditions-b",
        unit: "conditions",
        title: "switch and logical operators",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                int day = 2;
                switch (day) {
                  case 1:
                    std::cout << "Sun\n";
                    break;
                  case 2:
                    std::cout << "Mon\n";
                    break;
                  default:
                    std::cout << "Other\n";
                }
              `), output: "Mon" },
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                int a = 5;
                int b = 10;
                if (a > 3 && b < 10) {
                  std::cout << "both\n";
                } else {
                  std::cout << "not both\n";
                }
              `), output: "not both" },
            ],
          },
          {
            title: "Explain",
            instructions: "",
            questions: [
              { marks: 8, prompt: "case 1 below has no break. What is printed when day is 1, and why?", code: code`
                switch (day) {
                  case 1:
                    std::cout << "A";
                  case 2:
                    std::cout << "B";
                    break;
                  default:
                    std::cout << "C";
                }
              ` },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "cpp-loops-a",
        unit: "loops",
        title: "for and while loops",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Trace the loop",
            instructions: "Write exactly what each program prints, one line per output line.",
            questions: [
              { marks: 8, prompt: "What does this program print?", code: cpp(code`
                for (int i = 3; i >= 1; i--) {
                  std::cout << i << '\n';
                }
              `), output: "3\n2\n1" },
              { marks: 8, prompt: "What does this program print?", code: cpp(code`
                int sum = 0;
                for (int i = 1; i <= 10; i++) {
                  if (i % 3 == 0) {
                    sum += i;
                  }
                }
                std::cout << sum << '\n';
              `), output: "18" },
              { marks: 8, prompt: "What does this program print?", code: cpp(code`
                int n = 1;
                int steps = 0;
                while (n < 100) {
                  n *= 2;
                  steps++;
                }
                std::cout << steps << '\n';
              `), output: "7" },
            ],
          },
          {
            title: "Write a program",
            instructions: "",
            questions: [
              { marks: 16, prompt: "Write a program that reads a positive whole number n and uses a loop to print the sum 1 + 2 + ... + n." },
            ],
          },
        ],
      },
      {
        id: "cpp-loops-b",
        unit: "loops",
        title: "do-while and nested loops",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Trace the loop",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 5, prompt: "What does this program print?", code: cpp(code`
                int k = 10;
                do {
                  std::cout << k << '\n';
                  k++;
                } while (k < 5);
              `), output: "10" },
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                for (int row = 1; row <= 3; row++) {
                  for (int col = 1; col <= row; col++) {
                    std::cout << '*';
                  }
                  std::cout << '\n';
                }
              `), output: "*\n**\n***" },
            ],
          },
          {
            title: "Explain",
            instructions: "",
            questions: [
              { marks: 10, prompt: "Explain the difference between a while loop and a do-while loop. Use the first program as your example." },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "cpp-functions-a",
        unit: "functions",
        title: "Functions",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                std::cout << cube(3) << '\n';
              `, { before: code`
                int cube(int x) {
                  return x * x * x;
                }
              ` }), output: "27" },
              { marks: 6, prompt: "What does this program print?", code: cpp(code`
                int value = 5;
                addOne(value);
                std::cout << value << '\n';
              `, { before: code`
                void addOne(int n) {
                  n = n + 1;
                }
              ` }), output: "5" },
              { marks: 6, prompt: "The parameter is now a reference. What does this program print?", code: cpp(code`
                int value = 5;
                addOne(value);
                std::cout << value << '\n';
              `, { before: code`
                void addOne(int& n) {
                  n = n + 1;
                }
              ` }), output: "6" },
            ],
          },
          {
            title: "Write a function",
            instructions: "",
            questions: [
              { marks: 12, prompt: "Write a function bool isEven(int n), then use it in main to print every even number from 1 to 10." },
            ],
          },
        ],
      },
      {
        id: "cpp-functions-b",
        unit: "functions",
        title: "Functions with several parameters",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Predict the output",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 5, prompt: "What does this program print?", code: cpp(code`
                std::cout << maxOf(4, 9) << '\n';
                std::cout << maxOf(-2, -7) << '\n';
              `, { before: code`
                int maxOf(int a, int b) {
                  if (a > b) {
                    return a;
                  }
                  return b;
                }
              ` }), output: "9\n-2" },
              { marks: 4, prompt: "What does this program print?", code: cpp(code`
                std::cout << average(3, 4) << '\n';
              `, { before: code`
                double average(int a, int b) {
                  return (a + b) / 2.0;
                }
              ` }), output: "3.5" },
            ],
          },
          {
            title: "Explain",
            instructions: "",
            questions: [
              { marks: 6, prompt: "Why does average divide by 2.0 rather than 2? What would average(3, 4) return if it divided by 2?" },
            ],
          },
        ],
      },
    ],
    [
      {
        id: "cpp-arrays-a",
        unit: "arrays",
        title: "Arrays and vectors",
        instructions: INSTRUCTIONS,
        parts: [
          {
            title: "Read the code",
            instructions: "Write exactly what each program prints.",
            questions: [
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                int a[4] = {5, 10, 15, 20};
                std::cout << a[0] + a[3] << '\n';
              `), output: "25" },
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                std::vector<int> v = {1, 2, 3};
                v.push_back(4);
                std::cout << v.size() << '\n';
              `, { includes: ["iostream", "vector"] }), output: "4" },
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                int nums[] = {2, 4, 6};
                int sum = 0;
                for (int x : nums) {
                  sum += x;
                }
                std::cout << sum << '\n';
              `), output: "12" },
              { marks: 10, prompt: "What does this program print?", code: cpp(code`
                std::vector<int> v = {3, 1, 2};
                std::cout << v[v.size() - 1] << '\n';
              `, { includes: ["iostream", "vector"] }), output: "2" },
            ],
          },
          {
            title: "Write code",
            instructions: "",
            questions: [
              { marks: 20, prompt: "Write a program that stores five marks in a std::vector<int> and prints the highest mark." },
              { marks: 20, prompt: "An array is declared as int a[4]. Explain why reading a[4] is a bug, and which indexes are valid." },
              { marks: 20, prompt: "Write a function int countEven(const std::vector<int>& v) that returns how many elements of v are even." },
            ],
          },
        ],
      },
    ],
  ],
  paperExams: [
    {
      id: "cpp-test-1",
      title: "Unit test 1: output, types and arithmetic",
      instructions: "Answer every question on the paper provided. All programs are standard C++17.",
      solutionNotes: "Output answers must match exactly, including spaces.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 5, prompt: "What does this program print?", code: cpp(code`
              std::cout << 2 + 3 * 4 << '\n';
            `), output: "14", answer: "14. Multiplication happens before addition." },
            { marks: 5, prompt: "What does this program print?", code: cpp(code`
              int a = 20;
              int b = 6;
              std::cout << a / b << ' ' << a % b << '\n';
            `), output: "3 2", answer: "3 2. Integer division drops the fraction; 20 = 6 x 3 + 2." },
            { marks: 5, prompt: "What does this program print?", code: cpp(code`
              double d = 5 / 2;
              std::cout << d << '\n';
            `), output: "2", answer: "2. 5 / 2 is integer division (2) before the result is stored in the double." },
          ],
        },
        {
          title: "Explain",
          instructions: "",
          questions: [
            { marks: 5, prompt: "What is the difference between '\\n' and std::endl when printing?", answer: "Both end the line; std::endl also flushes the output stream, which is slower when done often." },
            { marks: 5, prompt: "Which type would you use for a student's age, a price, a grade letter and whether a door is open?", answer: "int for the age, double for the price, char for the grade letter and bool for the door." },
          ],
        },
      ],
    },
    {
      id: "cpp-test-2",
      title: "Unit test 2: conditions and loops",
      instructions: "Answer every question on the paper provided. All programs are standard C++17.",
      solutionNotes: "Award method marks for a correct loop structure with a small slip.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 20, prompt: "What does this program print?", code: cpp(code`
              int x = 7;
              if (x > 5) {
                if (x > 10) {
                  std::cout << "big\n";
                } else {
                  std::cout << "medium\n";
                }
              } else {
                std::cout << "small\n";
              }
            `), output: "medium", answer: "medium. 7 is above 5 but not above 10." },
            { marks: 20, prompt: "What does this program print?", code: cpp(code`
              int count = 0;
              for (int i = 0; i < 20; i += 5) {
                count++;
              }
              std::cout << count << '\n';
            `), output: "4", answer: "4. i takes the values 0, 5, 10 and 15." },
            { marks: 20, prompt: "What does this program print?", code: cpp(code`
              int n = 6;
              int f = 1;
              while (n > 1) {
                f *= n;
                n--;
              }
              std::cout << f << '\n';
            `), output: "720", answer: "720 = 6 x 5 x 4 x 3 x 2." },
          ],
        },
        {
          title: "Write a program",
          instructions: "",
          questions: [
            { marks: 40, prompt: "Write a program that reads marks until the user enters -1, then prints how many marks were entered and their average.", answer: "int mark;\nint count = 0;\ndouble sum = 0;\nwhile (std::cin >> mark && mark != -1) {\n  sum += mark;\n  count++;\n}\nstd::cout << count << '\\n';\nif (count > 0) {\n  std::cout << sum / count << '\\n';\n}" },
          ],
        },
      ],
    },
    {
      id: "cpp-test-3",
      title: "Unit test 3: functions and vectors",
      instructions: "Answer every question on the paper provided. All programs are standard C++17.",
      solutionNotes: "Accept a loop or a standard algorithm in the written function.",
      parts: [
        {
          title: "Predict the output",
          instructions: "",
          questions: [
            { marks: 6, prompt: "What does this program print?", code: cpp(code`
              std::cout << twice(twice(3)) << '\n';
            `, { before: code`
              int twice(int n) {
                return 2 * n;
              }
            ` }), output: "12", answer: "12. twice(3) is 6 and twice(6) is 12." },
            { marks: 6, prompt: "What does this program print?", code: cpp(code`
              int x = 1;
              int y = 2;
              swapValues(x, y);
              std::cout << x << y << '\n';
            `, { before: code`
              void swapValues(int& a, int& b) {
                int t = a;
                a = b;
                b = t;
              }
            ` }), output: "21", answer: "21. The reference parameters swap the caller's variables." },
            { marks: 6, prompt: "What does this program print?", code: cpp(code`
              std::vector<int> v = {4, 7};
              v.push_back(v[0] + v[1]);
              std::cout << v.back() << '\n';
            `, { includes: ["iostream", "vector"] }), output: "11", answer: "11. 4 + 7 is added at the end, and back() reads the last element." },
          ],
        },
        {
          title: "Write a function",
          instructions: "",
          questions: [
            { marks: 12, prompt: "Write a function that takes a std::vector<int> and returns its largest element. Assume the vector is not empty.", answer: "int largest(const std::vector<int>& v) {\n  int best = v[0];\n  for (int x : v) {\n    if (x > best) {\n      best = x;\n    }\n  }\n  return best;\n}" },
          ],
        },
      ],
    },
  ],
  // The online practice exam: choice questions plus a short Written Work part that staff mark.
  practiceExam: {
    id: "cpp-practice",
    title: "C++ practice exam: output to loops",
    instructions: "Part 1 is multiple choice. In Part 2, type your answers. All programs are standard C++17.",
    solutionNotes: "Part 2 is marked by your teacher.",
    parts: [
      {
        title: "Read the code",
        kind: "question_sheet",
        instructions: "",
        questions: [
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            std::cout << "Hello" << "World" << '\n';
          `), choices: ["HelloWorld", "Hello World", "Hello\nWorld", '"Hello" "World"'], prints: true, explanation: "<< adds no spaces or line breaks of its own." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            int a = 7;
            int b = 2;
            std::cout << a / b << '\n';
          `), choices: ["3", "3.5", "4", "1"], prints: true, explanation: "Both operands are int, so the fraction is discarded: 7 / 2 is 3." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            double x = 7;
            std::cout << x / 2 << '\n';
          `), choices: ["3.5", "3", "4", "3.50"], prints: true, explanation: "x is a double, so the division keeps the fraction; cout prints 3.5." },
          { marks: 3, prompt: "Which line correctly declares a whole-number variable named count with the value 5?",
            choices: ["int count = 5;", "count int = 5;", "int count := 5;", "integer count = 5;"], explanation: "The type comes first, then the name, then = and the value, ending with a semicolon." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            int n = 12;
            if (n % 2 == 0) {
              std::cout << "even\n";
            } else {
              std::cout << "odd\n";
            }
          `), choices: ["even", "odd", "0", "even\nodd"], prints: true, explanation: "12 % 2 is 0, so the first branch runs." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            bool ready = 4 > 3;
            std::cout << ready << '\n';
          `), choices: ["1", "true", "4", "0"], prints: true, explanation: "Without std::boolalpha, cout prints true as 1." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            for (int i = 1; i <= 3; i++) {
              std::cout << i;
            }
            std::cout << '\n';
          `), choices: ["123", "12", "0123", "1 2 3"], prints: true, explanation: "i runs from 1 to 3 inclusive, and nothing is printed between the numbers." },
          { marks: 3, prompt: "What does this program print?", code: cpp(code`
            int total = 0;
            int k = 1;
            while (k < 5) {
              total += k;
              k += 2;
            }
            std::cout << total << '\n';
          `), choices: ["4", "9", "3", "1"], prints: true, explanation: "k is 1 and then 3; at 5 the loop stops, so total is 1 + 3 = 4." },
        ],
      },
      {
        title: "Write your answer",
        kind: "written_work",
        instructions: "",
        questions: [
          { marks: 8, prompt: "Write a complete C++ program that reads two whole numbers with std::cin and prints their sum.", answer: cpp(code`
            int a;
            int b;
            std::cin >> a >> b;
            std::cout << a + b << '\n';
          `) },
          { marks: 8, prompt: "This program should print 5 down to 1, but it prints nothing. Explain the bug and write the corrected loop.", code: cpp(code`
            for (int i = 5; i < 1; i--) {
              std::cout << i << '\n';
            }
          `), output: "", answer: "The condition i < 1 is false when i is 5, so the body never runs. Use i >= 1:\nfor (int i = 5; i >= 1; i--) {\n  std::cout << i << '\\n';\n}" },
        ],
      },
    ],
  },
};
