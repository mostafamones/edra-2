"use server";

import { contentResult } from "../data";
import { readTaught, readTaughtOptions, writeTaught } from "./data";

export async function loadTaught(value: unknown) { return contentResult(() => readTaught(value)); }
export async function loadTaughtOptions(value: unknown) { return contentResult(() => readTaughtOptions(value)); }
export async function saveTaught(value: unknown) { return contentResult(() => writeTaught(value)); }
