import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccessTab } from "./tabs/bank/bank-access-tab";
import { CategoriesTab } from "./tabs/categories-tab";
import { KontoinhaberTab } from "./tabs/kontoinhaber-tab";
import { RecipientAccountsTab } from "./tabs/recipient-accounts-tab";
import { ProductIdTab } from "./tabs/product-id-tab";

const SETTINGS_TAB_VALUES = [
  "banking",
  "kontoinhaber",
  "recipients",
  "categories",
  "productId",
] as const;
type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return Boolean(
    value && SETTINGS_TAB_VALUES.includes(value as SettingsTabValue),
  );
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<SettingsTabValue>(() => {
    const tab = searchParams.get("tab");
    return isSettingsTabValue(tab) ? tab : "banking";
  }, [searchParams]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Einstellungen</h1>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (!isSettingsTabValue(value)) return;
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("tab", value);
            return next;
          });
        }}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="banking">Bankzugang</TabsTrigger>
          <TabsTrigger value="kontoinhaber">Kontoinhaber</TabsTrigger>
          <TabsTrigger value="recipients">Empfängerkonten</TabsTrigger>
          <TabsTrigger value="categories">Kategorien</TabsTrigger>
          <TabsTrigger value="productId">Produkt-ID</TabsTrigger>
        </TabsList>

        <TabsContent value="banking" className="pt-4">
          <BankAccessTab />
        </TabsContent>

        <TabsContent value="kontoinhaber" className="pt-4">
          <KontoinhaberTab />
        </TabsContent>

        <TabsContent value="recipients" className="pt-4">
          <RecipientAccountsTab />
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoriesTab />
        </TabsContent>

        <TabsContent value="productId" className="pt-4">
          <ProductIdTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
