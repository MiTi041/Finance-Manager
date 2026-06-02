import { createContext, useContext, useState, type ReactNode } from "react";

import { DateFilterValue } from "@/types/date-filter";

type GlobalDateFilterContextValue = {
  dateFilter: DateFilterValue;
  setDateFilter: (value: DateFilterValue) => void;
};

const GlobalDateFilterContext = createContext<
  GlobalDateFilterContextValue | undefined
>(undefined);

export function GlobalDateFilterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({});

  return (
    <GlobalDateFilterContext.Provider value={{ dateFilter, setDateFilter }}>
      {children}
    </GlobalDateFilterContext.Provider>
  );
}

export function useGlobalDateFilter() {
  const context = useContext(GlobalDateFilterContext);

  if (!context) {
    throw new Error(
      "useGlobalDateFilter muss innerhalb von GlobalDateFilterProvider genutzt werden.",
    );
  }

  return context;
}
