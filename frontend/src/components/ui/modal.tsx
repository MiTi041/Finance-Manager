"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ModalProps {
    children: React.ReactNode
    onClose: () => void
}

export default function Modal({ children, onClose }: ModalProps) {
    return (
        <Dialog open>
            <DialogContent className="flex flex-col gap-8">
                {children}
            </DialogContent>
        </Dialog>
    )
}

Modal.Title = ({ children }: { children: React.ReactNode }) => {
    return <DialogTitle>{children}</DialogTitle>
}

Modal.Header = ({ children }: { children: React.ReactNode }) => {
    return (
        <DialogHeader>
            <DialogTitle>{children}</DialogTitle>
        </DialogHeader>
    )
}

Modal.Body = ({ children }: { children: React.ReactNode }) => {
    return <DialogDescription>{children}</DialogDescription>
}

Modal.Footer = ({ children }: { children: React.ReactNode }) => {
    return <DialogFooter>{children}</DialogFooter>
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn(
                "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
                className
            )}
            {...props}
        />
    )
}

