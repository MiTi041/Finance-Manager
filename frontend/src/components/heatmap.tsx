import { Card, CardContent } from "@/components/ui/card"
import clsx from "clsx"
import { getISOWeek } from "date-fns"
import React, { useState, useRef, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Flame } from "lucide-react"

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

type HeatmapProps = {
    title: string
    description?: string
    showValue?: boolean
    unitName?: string
    color?: string
    data: number[][]
    mode?: "positiv" | "negativ"
}

export default function Heatmap({
    title,
    description,
    showValue = false,
    color = "#007BFF",
    data,
    mode,
}: HeatmapProps) {
    if (!data || data.length !== 7) {
        return null
    }
    const today = new Date()

    const scrollRef = useRef<HTMLDivElement>(null)
    const [atStart, setAtStart] = useState(true) // Anfangs ganz links
    const [atEnd, setAtEnd] = useState(false)
    const [streak, setStreak] = useState(0)
    const [longestStreak, setLongestStreak] = useState(0)

    const handleScroll = () => {
        if (!scrollRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current

        setAtStart(scrollLeft <= 1) // kleines Toleranzpixel
        setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1)
    }

    const calculateStreak = (mode: "positiv" | "negativ" = "positiv") => {
        const today = new Date()
        const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

        let streakCount = 0
        let breakStreak = false
        let firstValueSeen = false

        const totalWeeks = data[0].length

        for (let w = totalWeeks - 1; w >= 0 && !breakStreak; w--) {
            for (let d = 6; d >= 0; d--) {
                const date = getDateOfCell(w, d, data)
                if (stripTime(date) > stripTime(today)) continue

                const value = data[d][w]

                if (mode === "positiv") {
                    if (value > 0) {
                        streakCount++
                    } else {
                        breakStreak = true
                        break
                    }
                } else {
                    if (value > 0) {
                        firstValueSeen = true
                        breakStreak = true
                        break
                    }
                    if (firstValueSeen || value === 0) {
                        streakCount++
                    }
                }
            }
        }

        setStreak(streakCount)
    }

    const calculateLongestStreak = (mode: "positiv" | "negativ" = "positiv") => {
        let longest = 0
        let current = 0
        let firstValueSeen = false

        const today = new Date()
        const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

        const totalWeeks = data[0].length

        for (let w = 0; w < totalWeeks; w++) {
            for (let d = 0; d < 7; d++) {
                const date = getDateOfCell(w, d, data)
                if (stripTime(date) > stripTime(today)) continue

                const value = data[d][w]

                if (mode === "positiv") {
                    if (value > 0) {
                        current++
                        longest = Math.max(longest, current)
                    } else {
                        current = 0
                    }
                } else {
                    if (value > 0) {
                        firstValueSeen = true
                        current = 0
                    } else if (firstValueSeen) {
                        current++
                        longest = Math.max(longest, current)
                    }
                }
            }
        }

        setLongestStreak(longest)
    }

    useEffect(() => {
        calculateStreak(mode ?? "positiv")
        calculateLongestStreak(mode ?? "positiv")
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const observer = new ResizeObserver(() => {
            el.scrollLeft = el.scrollWidth
        })

        observer.observe(el)

        // Direkt initial scrollen
        el.scrollLeft = el.scrollWidth

        return () => observer.disconnect()
    }, [])

    return (
        <Card>
            <CardContent className="space-y-2">
                <div className="space-y-1 mb-4">
                    <div className="space-x-1 flex flex-col gap-2">
                        <h3 className="text-lg font-semibold">{title}</h3>
                        {longestStreak > 0 && <div className="text-sm text-muted-foreground flex flex-row items-center gap-1">
                            Longest streak
                            <Badge className="text-sm" variant="secondary">
                                <Flame className="size-3" />
                                {longestStreak}
                            </Badge>
                        </div>}

                        {streak > 0 && <div className="text-sm text-muted-foreground flex flex-row items-center gap-1">
                            Current streak
                            <Badge className="text-sm" variant="secondary">
                                <Flame className="size-3" />
                                {streak}
                            </Badge>
                        </div>}
                    </div>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>

                <div className="">
                    <div className="flex items-end">
                        {/* Tagesnamen links */}
                        <div className="flex flex-col gap-1 pr-2">
                            {daysOfWeek.map((day, index) => (
                                <div key={index} className="h-5 text-right text-[12px] text-muted-foreground font-mono">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Wochen-Daten */}
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="flex flex-row gap-1 overflow-x-auto no-scrollbar "
                            style={{
                                maskImage: `
                                linear-gradient(
                                    to right,
                                    ${atStart ? "black" : "transparent"} 0%,
                                    black 5%,
                                    black 95%,
                                    ${atEnd ? "black" : "transparent"} 100%
                                )
                            `,
                                WebkitMaskImage: `
                                linear-gradient(
                                    to right,
                                    ${atStart ? "black" : "transparent"} 0%,
                                    black 5%,
                                    black 95%,
                                    ${atEnd ? "black" : "transparent"} 100%
                                )
                            `,
                            }}
                        >
                            {data[0].map((_, weekIndex) => {
                                // Für alle 7 Tage die Werte in einer Woche sammeln
                                const weekValues = data.map((_, dayIndex) => data[dayIndex][weekIndex] ?? 0)
                                const weekStartDate = getDateOfCell(weekIndex, 0, data)
                                const isoWeek = getISOWeek(weekStartDate)

                                return (
                                    <div key={weekIndex} className="flex flex-col items-center gap-1">
                                        <div className="text-[10px] text-muted-foreground font-mono">
                                            {isoWeek}
                                        </div>
                                        {weekValues.map((value, dayIndex) => {
                                            // Keine zukünftigen Tage anzeigen
                                            const cellDate = getDateOfCell(weekIndex, dayIndex, data)
                                            const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
                                            const isFuture = stripTime(cellDate).getTime() > stripTime(today).getTime()

                                            const backgroundColor = color

                                            return (
                                                <div
                                                    key={dayIndex}
                                                    className={clsx("h-5 w-5 rounded border-0", {
                                                        "border-border": value === 0,
                                                        "bg-muted": value === 0,
                                                        "opacity-0 pointer-events-none": isFuture,
                                                    })}
                                                    style={{
                                                        backgroundColor: value > 0 ? backgroundColor : undefined,
                                                    }}
                                                >
                                                    {showValue && value > 0 && (
                                                        <div className="text-[10px] text-center leading-5 text-white">
                                                            {value}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// 🔧 Berechnet Datum einer Zelle (Woche, Tag)
function getDateOfCell(weekIndex: number, dayIndex: number, data: number[][]): Date {
    const today = new Date()
    const day = today.getDay()
    const daysSinceMonday = day === 0 ? 6 : day - 1
    const startOfCurrentWeek = new Date(today)
    startOfCurrentWeek.setDate(today.getDate() - daysSinceMonday)

    const date = new Date(startOfCurrentWeek)
    date.setDate(startOfCurrentWeek.getDate() - (data[0].length - 1 - weekIndex) * 7 + dayIndex)
    return date
}