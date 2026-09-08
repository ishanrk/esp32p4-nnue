import { SetupGuide } from "./guides/setup";
import { IntegrationGuide } from "./guides/integration";
import { HowItWorks, RecordedGame, Results } from "./guides/engineering";
export function Guide({ view }: {view: "setup" | "integration" | "how" | "recorded" | "results"}) {
  if (view === "setup") return <SetupGuide />;
  if (view === "integration") return <IntegrationGuide />;
  if (view === "recorded") return <RecordedGame />;
  if (view === "results") return <Results />;
  return <HowItWorks />;
}
