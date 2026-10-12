import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION, BUILD, buildLabel } from "../js/build.js";

test("версия записана в виде номера, а без подстановки сборка называется «разработка»", () => {
  assert.match(APP_VERSION, /^\d+\.\d+(\.\d+)?$/);
  assert.equal(BUILD, "__BUILD__", "в репозитории стоит маркер: номер коммита подставляет только workflow");
  assert.equal(buildLabel, "разработка");
});

test("версия в коде и в README совпадают", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes(`**v${APP_VERSION}.**`), `в README нет записи об изменениях v${APP_VERSION}`);
});
