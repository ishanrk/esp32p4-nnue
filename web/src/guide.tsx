import { SetupGuide } from "./guides/setup";
import { IntegrationGuide } from "./guides/integration";
import { HowItWorks } from "./guides/engineering";
export function Guide({ view }: {view: "setup" | "integration" | "how"}) {
  if (view === "setup") return <SetupGuide />;
  if (view === "integration") return <IntegrationGuide />;
  return <HowItWorks />;
}
