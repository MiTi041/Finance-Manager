"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { createPortal } from "react-dom"

export type Option = {
    value: string
    label: string
    [key: string]: string
}

type AutoCompleteProps = {
    suggestions: Option[]
    emptyMessage: string
    value?: Option
    onValueChange?: (value: Option) => void
    onInputValueChange?: (value: string) => void
    isLoading?: boolean
    disabled?: boolean
    placeholder?: string
}

export const AutoComplete = ({
    suggestions,
    placeholder,
    emptyMessage,
    value,
    onValueChange,
    onInputValueChange,
    disabled,
    isLoading = false,
}: AutoCompleteProps) => {
    const [inputValue, setInputValue] = useState(value?.label ?? "")
    const [filtered, setFiltered] = useState<Option[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (value) {
            setInputValue(value.label)
        }
    }, [value])

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value
        onInputValueChange?.(newValue)
        setInputValue(newValue)

        if (newValue.length > 0) {
            const filteredSuggestions = suggestions.filter((s) =>
                s.label.toLowerCase().includes(newValue.toLowerCase()),
            )
            setFiltered(filteredSuggestions)
            setIsOpen(true)

            // Input-Position berechnen
            if (inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect()
                setPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width })
            }
        } else {
            setIsOpen(false)
            setFiltered([])
        }
    }

    const handleSuggestionClick = (suggestion: Option) => {
        setInputValue(suggestion.label)
        setIsOpen(false)
        onValueChange?.(suggestion)
    }

    return (
        <div className="w-full max-w-md">
            <div className="relative">
                <Input
                    ref={inputRef}
                    className="min-w-60 w-full"
                    onBlur={() => setIsOpen(false)}
                    onFocus={() => { if (inputValue) setIsOpen(true) }}
                    id="autocomplete"
                    type="text"
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={handleInputChange}
                    disabled={disabled || isLoading}
                />
                {isOpen && position &&
                    createPortal(
                        <div
                            className="z-50 mt-2 bg-muted rounded-md shadow-lg max-h-60 overflow-y-auto p-1 border-border border"
                            style={{
                                position: "absolute",
                                top: position.top,
                                left: position.left,
                                width: position.width,
                            }}
                        >
                            {filtered.length > 0 ? (
                                <ul>
                                    {filtered.map((s, index) => (
                                        <li
                                            key={index}
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                handleSuggestionClick(s)
                                            }}
                                            className="px-4 py-2 hover:bg-border cursor-pointer rounded-sm"
                                        >
                                            {s.label}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="px-4 py-2 text-sm text-gray-500">
                                    {emptyMessage}
                                </div>
                            )}
                        </div>,
                        document.body
                    )}
            </div>
        </div>
    )
}