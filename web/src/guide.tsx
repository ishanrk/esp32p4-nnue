import { SetupGuide } from "./guides/setup";
import { IntegrationGuide } from "./guides/integration";
import { HowItWorks, Results } from "./guides/engineering";
export function Guide({ view }: {view: "setup" | "integration" | "how" | "results"}) {
  if (view === "setup") return <SetupGuide />;
  if (view === "integration") return <IntegrationGuide />;
  if (view === "results") return <Results />;
  return <HowItWorks />;
}
