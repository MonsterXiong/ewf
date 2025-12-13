import { InMemoryRunStore } from "./store.inmem";
import { MySqlRunStore } from "./store.mysql";

export function createRunStoreFromEnv() {
  if (process.env.EWF_MYSQL_URL || process.env.EWF_MYSQL_HOST) {
    return new MySqlRunStore();
  }
  return new InMemoryRunStore();
}
