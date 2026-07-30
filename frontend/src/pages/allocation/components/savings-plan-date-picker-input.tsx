'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { formatDateDisplay, formatDateInputValue, parseIsoDate } from '../utils'

export function SavingsPlanDatePickerInput({
    defaultValue,
    placeholder,
    onChange,
}: {
    defaultValue?: string | null
    placeholder?: string
    onChange?: (date: Date | null) => void
}) {
    const [open, setOpen] = useState(false)
    const [date, setDate] = useState<Date | undefined>(parseIsoDate(defaultValue))
    const [month, setMonth] = useState<Date | undefined>(parseIsoDate(defaultValue) ?? new Date())
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endMonth = new Date(now.getFullYear() + 50, 11, 31)

    return (
        <div className="flex items-center gap-2">
            <Input
                value={formatDateDisplay(date)}
                placeholder={placeholder ?? 'Datum wählen'}
                readOnly
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        setOpen(true)
                    }
                }}
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="Datum auswählen">
                        <CalendarIcon className="size-4" />
                        <span className="sr-only">Datum auswählen</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="end" sideOffset={8}>
                    <Calendar
                        mode="single"
                        selected={date}
                        month={month}
                        captionLayout="dropdown"
                        fromDate={today}
                        endMonth={endMonth}
                        disabled={{ before: today }}
                        onMonthChange={setMonth}
                        onSelect={(selectedDate) => {
                            setDate(selectedDate)
                            setMonth(selectedDate ?? month)
                            setOpen(false)
                            onChange?.(selectedDate ?? null)
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}
