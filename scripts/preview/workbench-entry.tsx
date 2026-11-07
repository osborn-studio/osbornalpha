/** Actual production component tree; only the authenticated transport is replaced by the local fixture server. */
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { MacroWorkbench } from "../../src/components/macro/MacroWorkbench";
import { correlationOptions } from "../../src/lib/macro/workbench-options";
import en from "../../messages/en/macro.json";
import zh from "../../messages/zh/macro.json";
import "../../src/app/globals.css";
const search = new URLSearchParams(location.search);
const locale = search.get("locale") === "en" ? "en" : "zh";
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider
    locale={locale}
    messages={{ macro: locale === "en" ? en : zh }}
    timeZone="UTC"
  >
    {/* Matches the protected app layout's real main width/padding, without auth, global account chrome or production credentials. */}
    <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">
      <MacroWorkbench
        initialRegion={search.get("region") === "CN" ? "CN" : "US"}
        initialTab="overview"
        judgmentsEnabled
        options={correlationOptions()}
        strategyEnabled
      />
    </main>
  </NextIntlClientProvider>,
);
