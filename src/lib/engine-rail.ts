import type { InstanceInfo } from "@/state/store";
import { agentCliInstances } from "./agent-cli";

export function configuredModelInstances(instances: readonly InstanceInfo[], selectedInstanceId?: string): InstanceInfo[] {
  return agentCliInstances(instances).filter((instance) =>
    instance.instanceId === selectedInstanceId
      || (instance.snapshot.state === "available" && instance.models.options.length > 0));
}
