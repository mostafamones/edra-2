import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const inputVariants = cva(
  "w-full min-w-0 text-base transition-[color,background-color,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default: "h-9 rounded-md border border-transparent bg-muted/60 px-2.5 py-1 focus-visible:bg-muted",
        line: "h-7 border-b border-transparent bg-transparent px-1 py-0.5 hover:border-input/60 focus-visible:border-ring",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Input({ className, type, variant, ...props }: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input }
