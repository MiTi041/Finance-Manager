"use client"

import { ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "@lib/utils"

type EmptyStateProps = {
    title: string
    text?: string
    illustration?: ReactNode
    button?: ReactNode[]
    margin?: string
    className?: string
}

export function EmptyState({
    title,
    text,
    illustration,
    button = [],
    margin = "my-12",
    ...props
}: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn("w-full flex justify-center", margin, props.className)}
        >
            <div className="flex flex-col items-center justify-center text-center px-4">
                {illustration && <div className="text-4xl mb-4">{illustration}</div>}
                <h1 className="text-md font-bold mb-2">{title}</h1>
                <p className="text-sm text-gray-600">
                    {text}
                </p>

                {button.length > 0 && (
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {button.map((btn, i) => (
                            <div key={i}>{btn}</div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    )
}