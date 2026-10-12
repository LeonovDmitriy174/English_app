// folders.js — свои папки книг (и встроенные из каталога): создание, переименование, перемещение, удаление.
import { db } from "../db.js";
import { cleanName, nameTaken, newGroupId, toggleMembership, folderTree, siblingsOf, canNestIn, subtreeIds } from "../shelf.js";
import { app, emit } from "./state.js";
import { persistBook } from "./books.js";

// ── Папки книг ────────────────────────────────────────────────────────────
// Внутри хранилища они по-прежнему называются groups (так записаны ваши данные и резервные копии).
// Вложенность одна: у папки верхнего уровня бывают вложенные, у вложенных своих нет. Это правило проверяется здесь,
// поэтому из интерфейса, из резервной копии и из каталога глубже одной вложенности не получится.
export const persistGroups = () => db.put("kv", { key: "groups", value: app.groups });
export const folders = () => folderTree({ catalog: app.catalog, userGroups: app.groups });

const NESTED_ERR = "Глубже одной вложенности папки не делаются";

/** Проверка названия среди соседей (папок в той же папке). Возвращает текст ошибки или "". */
function nameProblem(name, parent, except = null) {
  if (!name) return "Введите название папки";
  if (nameTaken(name, siblingsOf(folders(), parent), except)) return parent ? "В этой папке уже есть папка с таким названием" : "Папка с таким названием уже есть";
  return "";
}

/** Новая своя папка; parent — id папки верхнего уровня или null. Возвращает { group } или { error } с причиной по-русски. */
export async function createGroup(name, parent = null) {
  const clean = cleanName(name);
  if (parent && !canNestIn(folders(), parent)) return { error: folders().byId.has(parent) ? NESTED_ERR : "Папки, куда вы кладёте, уже нет" };
  const error = nameProblem(clean, parent);
  if (error) return { error };
  const g = { id: newGroupId(), name: clean, created: Date.now(), ...(parent ? { parent } : {}) };
  app.groups.push(g);
  await persistGroups();
  emit();
  return { group: g };
}

export async function renameGroup(id, name) {
  const g = app.groups.find((x) => x.id === id);
  if (!g) return { error: "Папки уже нет" };
  const clean = cleanName(name);
  const error = nameProblem(clean, folders().byId.get(id)?.parent || null, id);
  if (error) return { error };
  g.name = clean;
  await persistGroups();
  emit();
  return { group: g };
}

/** Перекладывает свою папку на верхний уровень (parent = null) или внутрь папки верхнего уровня. */
export async function moveGroup(id, parent = null) {
  const g = app.groups.find((x) => x.id === id);
  if (!g) return { error: "Папки уже нет" };
  const tree = folders();
  const node = tree.byId.get(id);
  if (parent) {
    if (parent === id || !tree.byId.has(parent)) return { error: "Папки, куда вы кладёте, уже нет" };
    if (node.children.length || !canNestIn(tree, parent)) return { error: NESTED_ERR };
  }
  if ((node.parent || null) === (parent || null)) return { group: g };
  const error = nameProblem(g.name, parent, id);
  if (error) return { error: parent ? "В выбранной папке уже есть папка с таким названием" : "На верхнем уровне уже есть папка с таким названием" };
  if (parent) g.parent = parent;
  else delete g.parent;
  await persistGroups();
  emit();
  return { group: g };
}

/** Удаляет свою папку вместе с вложенными, но не книги: они просто выходят из папок. Возвращает число удалённых папок. */
export async function deleteGroup(id) {
  const mine = new Set(app.groups.map((g) => g.id));
  if (!mine.has(id)) return 0;
  const gone = new Set(subtreeIds(folders(), id).filter((x) => mine.has(x)));
  app.groups = app.groups.filter((g) => !gone.has(g.id));
  await persistGroups();
  for (const b of app.books) {
    if (b.groups?.some((x) => gone.has(x))) {
      b.groups = b.groups.filter((x) => !gone.has(x));
      await persistBook(b);
    }
  }
  const meta = (await db.get("kv", "bookmeta"))?.value;
  if (meta && Object.values(meta).some((m) => m.groups?.some((x) => gone.has(x)))) {
    for (const m of Object.values(meta)) m.groups = (m.groups || []).filter((x) => !gone.has(x));
    await db.put("kv", { key: "bookmeta", value: meta });
  }
  emit();
  return gone.size;
}

/** Кладёт книгу в свою папку или достаёт её оттуда. */
export async function toggleBookGroup(bookId, groupId) {
  const b = app.books.find((x) => x.id === bookId);
  if (!b || !app.groups.some((g) => g.id === groupId)) return;
  b.groups = toggleMembership(b.groups, groupId);
  await persistBook(b);
  emit();
}
