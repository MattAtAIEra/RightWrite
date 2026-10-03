// src/storage/db.ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Profile, Session, CharStat, HandwritingImage } from "./types";

export const DB_NAME = "rightwrite-personalization";
export const DB_VERSION = 1;

export interface RWDBSchema extends DBSchema {
  profiles: {
    key: string;
    value: Profile;
  };
  sessions: {
    key: string;
    value: Session;
    indexes: {
      byProfile: string;
      byStartedAt: number;
      byProfileGradeLesson: [string, string, number];
    };
  };
  charStats: {
    key: [string, string, string];
    value: CharStat;
    indexes: {
      byProfile: string;
      byMistakeRate: [string, number];
    };
  };
  handwritingImages: {
    key: string;
    value: HandwritingImage;
    indexes: {
      byProfile: string;
      byCapturedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<RWDBSchema>> | null = null;
let dbInstance: IDBPDatabase<RWDBSchema> | null = null;

export function getDB(): Promise<IDBPDatabase<RWDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RWDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("byProfile", "profileId");
          sessions.createIndex("byStartedAt", "startedAt");
          sessions.createIndex("byProfileGradeLesson", ["profileId", "gradeId", "startLesson"]);
        }
        if (!db.objectStoreNames.contains("charStats")) {
          const charStats = db.createObjectStore("charStats", {
            keyPath: ["profileId", "gradeId", "char"],
          });
          charStats.createIndex("byProfile", "profileId");
          charStats.createIndex("byMistakeRate", ["profileId", "mistakeRate"]);
        }
        if (!db.objectStoreNames.contains("handwritingImages")) {
          const images = db.createObjectStore("handwritingImages", { keyPath: "id" });
          images.createIndex("byProfile", "profileId");
          images.createIndex("byCapturedAt", "capturedAt");
        }
      },
    }).then((db) => {
      dbInstance = db;
      return db;
    });
  }
  return dbPromise;
}

export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
}
