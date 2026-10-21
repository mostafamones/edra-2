// Programming Foundations: language-neutral algorithms in plain-language pseudocode. Every course starts here.
import { code } from "./text.mjs";

export const foundations = {
  id: "foundations",
  course: "Programming Foundations",
  units: { algorithms: "Algorithms and tracing" },
  // Variants of the first assignment slot of every course.
  assignments: [
    {
      id: "foundations-algorithms-a",
      unit: "algorithms",
      title: "Thinking like a programmer",
      instructions: "Answer on paper. Show each step of your traces.",
      parts: [
        {
          title: "Trace the steps",
          instructions: "",
          questions: [
            {
              marks: 3,
              prompt: "Trace this algorithm and write the final value of total.",
              code: code`
                set total to 0
                repeat for n = 1, 2, 3, 4
                  add n to total
                end repeat
              `,
            },
            {
              marks: 3,
              prompt: "Follow the steps when x is 7 and write what is displayed.",
              code: code`
                if x is even
                  display "even"
                otherwise
                  display "odd"
              `,
            },
          ],
        },
        {
          title: "Write an algorithm",
          instructions: "",
          questions: [
            { marks: 4, prompt: "Write numbered steps for making a cup of tea for someone who has never made one. Include at least one decision, such as sugar or no sugar." },
          ],
        },
      ],
    },
    {
      id: "foundations-algorithms-b",
      unit: "algorithms",
      title: "Algorithms in everyday life",
      instructions: "Answer on paper. Show each step of your traces.",
      parts: [
        {
          title: "Put the steps in order",
          instructions: "",
          questions: [
            {
              marks: 4,
              prompt: "These steps find the largest of three numbers a, b and c, but they are mixed up. Write the letters in the correct order.",
              code: code`
                A. if c is greater than largest, set largest to c
                B. display largest
                C. set largest to a
                D. if b is greater than largest, set largest to b
              `,
            },
            { marks: 4, prompt: "Trace your ordered steps with a = 4, b = 9 and c = 2. Write the value of largest after each step." },
          ],
        },
        {
          title: "Loops in plain language",
          instructions: "",
          questions: [
            {
              marks: 6,
              prompt: "Trace this algorithm and write every value it displays.",
              code: code`
                set count to 10
                while count is greater than 0
                  display count
                  subtract 3 from count
                end while
              `,
            },
            { marks: 6, prompt: "Write an algorithm that uses a loop to display the multiples of 5 from 5 to 20." },
          ],
        },
      ],
    },
  ],
};
