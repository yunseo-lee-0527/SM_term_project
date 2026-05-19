import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notebook } from "../types/ink";

const NOTEBOOK_STORAGE_KEY = "inkpad-lab.notebook.v1";

export async function loadNotebook() {
  const rawNotebook = await AsyncStorage.getItem(NOTEBOOK_STORAGE_KEY);

  if (!rawNotebook) {
    return null;
  }

  try {
    const notebook = JSON.parse(rawNotebook) as Notebook;

    if (!Array.isArray(notebook.pages) || notebook.pages.length === 0) {
      return null;
    }

    return notebook;
  } catch {
    return null;
  }
}

export async function saveNotebook(notebook: Notebook) {
  await AsyncStorage.setItem(NOTEBOOK_STORAGE_KEY, JSON.stringify(notebook));
}
