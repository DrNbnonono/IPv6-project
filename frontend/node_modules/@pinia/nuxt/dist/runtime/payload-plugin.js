import {
  definePayloadPlugin,
  definePayloadReducer,
  definePayloadReviver
} from "#imports";
import { shouldHydrate } from "pinia";
const payloadPlugin = definePayloadPlugin(() => {
  definePayloadReducer(
    "skipHydrate",
    // We need to return something truthy to be treated as a match
    (data) => !shouldHydrate(data) && 1
  );
  definePayloadReviver("skipHydrate", (_data) => void 0);
});
export default payloadPlugin;
