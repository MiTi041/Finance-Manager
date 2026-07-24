import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Contact,
  Database,
  Fingerprint,
  RefreshCw,
  Tags,
  UserCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ProductIdTab } from "./tabs/product-id-tab";
import { DbExportImportTab } from "./tabs/db-export-import-tab";
import { BankAccessTab } from "./tabs/bank/bank-access-tab";
import { ZahlungspartnerTab } from "./tabs/zahlungspartner/zahlungspartner-tab";
import { RecipientAccountsTab } from "./tabs/recipient-accounts/recipient-accounts-tab";
import { CategoriesTab } from "./tabs/categories/categories-tab";
import { SyncTab } from "./tabs/sync-tab";

const SETTINGS_TAB_VALUES = [
  "banking",
  "zahlungspartner",
  "recipients",
  "categories",
  "sync",
  "productId",
  "database",
] as const;
type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return Boolean(value && SETTINGS_TAB_VALUES.includes(value as SettingsTabValue));
}

const tabs = [
  { value: "banking" as const, label: "Bankzugang", icon: Building2 },
  { value: "zahlungspartner" as const, label: "Zahlungspartner", icon: Contact },
  { value: "recipients" as const, label: "Empfängerkonten", icon: UserCheck },
  { value: "categories" as const, label: "Kategorien", icon: Tags },
  { value: "sync" as const, label: "Sync", icon: RefreshCw },
  { value: "productId" as const, label: "Produkt-ID", icon: Fingerprint },
  { value: "database" as const, label: "Datenbank", icon: Database },
];

const tabComponents: Record<SettingsTabValue, () => React.ReactNode> = {
  banking: () => <BankAccessTab />,
  zahlungspartner: () => <ZahlungspartnerTab />,
  recipients: () => <RecipientAccountsTab />,
  categories: () => <CategoriesTab />,
  sync: () => <SyncTab />,
  productId: () => <ProductIdTab />,
  database: () => <DbExportImportTab />,
};

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<SettingsTabValue>(() => {
    const tab = searchParams.get("tab");
    return isSettingsTabValue(tab) ? tab : "banking";
  }, [searchParams]);

  return (
    <div className="flex w-full gap-6 py-6">
      <Sidebar collapsible="none" className="relative border border-border/50 rounded-xl h-min">
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {tabs.map(({ value, label, icon: Icon }) => (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    isActive={activeTab === value}
                    onClick={() => {
                      setSearchParams((current) => {
                        const next = new URLSearchParams(current);
                        next.set("tab", value);
                        return next;
                      });
                    }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <div className="flex-1 overflow-hidden pr-6">{tabComponents[activeTab]()}</div>
    </div>
  );
}
