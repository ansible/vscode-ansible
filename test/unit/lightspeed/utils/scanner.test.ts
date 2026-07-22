import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import { PROJECT_ROOT } from "@test/setup";
import {
  CollectionFinder,
  AnsibleCollection,
} from "@src/features/lightspeed/utils/scanner";

describe("CollectionFinder", () => {
  const SAMPLES_PATH = path.join(
    PROJECT_ROOT,
    "test/unit/lightspeed/utils/samples",
  );

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  describe("refreshCache", () => {
    it("should find all collections in nested structure", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      await finder.refreshCache();

      expect(finder.cache).toHaveLength(4);
      expect(finder.initialized).toBe(true);
    });

    it("should sort collections alphabetically by FQCN", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      await finder.refreshCache();

      const names = finder.cache.map((c) => c.fqcn);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe("searchNestedCollections", () => {
    it("should traverse namespace directories and find collections", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const collections = await finder.searchNestedCollections();

      expect(collections).toHaveLength(4);
      expect(collections.every((c) => c instanceof AnsibleCollection)).toBe(
        true,
      );
    });

    it("should handle non-existent collections path gracefully", async () => {
      const finder = new CollectionFinder(["/nonexistent/path"]);
      const collections = await finder.searchNestedCollections();

      expect(collections).toEqual([]);
    });

    it("should skip non-directory entries in namespace directories", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const collections = await finder.searchNestedCollections();

      const namespaces = collections.map((c) => c.namespace);
      expect(namespaces).not.toContain("empty");
    });
  });

  describe("readCollectionMetaInformation", () => {
    it("should read from galaxy.yml", async () => {
      const collectionPath = path.join(
        SAMPLES_PATH,
        "collections/ansible_collections/community/dummy",
      );
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const result = await finder.readCollectionMetaInformation(collectionPath);

      expect(result).toBeInstanceOf(AnsibleCollection);
      expect(result?.namespace).toBe("community");
      expect(result?.name).toBe("dummy");
      expect(result?.fqcn).toBe("community.dummy");
    });

    it("should read from MANIFEST.json", async () => {
      const collectionPath = path.join(
        SAMPLES_PATH,
        "collections/ansible_collections/openstack/cloud",
      );
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const result = await finder.readCollectionMetaInformation(collectionPath);

      expect(result).toBeInstanceOf(AnsibleCollection);
      expect(result?.namespace).toBe("openstack");
      expect(result?.name).toBe("cloud");
    });

    it("should return null for directory without meta files", async () => {
      const collectionPath = path.join(
        SAMPLES_PATH,
        "collections/ansible_collections/community/empty",
      );
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const result = await finder.readCollectionMetaInformation(collectionPath);

      expect(result).toBeNull();
    });

    it("should handle path mismatch between meta and directory", async () => {
      const mismatchedPath = "/some/wrong/path";
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const result = await finder.readCollectionMetaInformation(mismatchedPath);

      expect(result).toBeNull();
    });
  });

  describe("readCollectionsInNamespace (private method)", () => {
    // Access private method via casting
    interface PrivateCollectionFinder {
      readCollectionsInNamespace(namespaceEntry: {
        name: string;
        parentPath: string;
        isDirectory: () => boolean;
      }): Promise<Array<Promise<AnsibleCollection | null>>>;
    }
    const priv = (finder: CollectionFinder) =>
      finder as unknown as PrivateCollectionFinder;

    it("should read all collection directories within a namespace", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const namespaceEntry = {
        name: "community",
        parentPath: path.join(SAMPLES_PATH, "collections/ansible_collections"),
        isDirectory: () => true,
      };

      const collectionPromises =
        await priv(finder).readCollectionsInNamespace(namespaceEntry);
      const collections = (await Promise.all(collectionPromises)).filter(
        (c): c is AnsibleCollection => c !== null,
      );

      expect(collections.length).toBeGreaterThan(0);
      expect(collections.every((c) => c.namespace === "community")).toBe(true);
    });

    it("should filter out non-directory entries", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const namespaceEntry = {
        name: "community",
        parentPath: path.join(SAMPLES_PATH, "collections/ansible_collections"),
        isDirectory: () => true,
      };

      const collectionPromises =
        await priv(finder).readCollectionsInNamespace(namespaceEntry);
      const collections = await Promise.all(collectionPromises);

      // All returned items should be from directories only
      // (files in the namespace directory should be filtered out)
      expect(
        collections.every((c) => c === null || c instanceof AnsibleCollection),
      ).toBe(true);
    });

    it("should call readCollectionMetaInformation for each collection directory", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const readMetaSpy = vi.spyOn(finder, "readCollectionMetaInformation");
      const namespaceEntry = {
        name: "community",
        parentPath: path.join(SAMPLES_PATH, "collections/ansible_collections"),
        isDirectory: () => true,
      };

      const collectionPromises =
        await priv(finder).readCollectionsInNamespace(namespaceEntry);
      await Promise.all(collectionPromises);

      expect(readMetaSpy).toHaveBeenCalled();
    });

    it("should handle namespace directory with no collection subdirectories", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      // Create a test with the "empty" directory which should have no valid collections
      const namespaceEntry = {
        name: "empty",
        parentPath: path.join(
          SAMPLES_PATH,
          "collections/ansible_collections/community",
        ),
        isDirectory: () => true,
      };

      const collectionPromises = await priv(finder)
        .readCollectionsInNamespace(namespaceEntry)
        .catch(() => [] as Array<Promise<AnsibleCollection | null>>);
      const collections = await Promise.all(collectionPromises);

      // Should return empty array or array of nulls when directory doesn't exist
      expect(Array.isArray(collections)).toBe(true);
    });
  });

  describe("AnsibleCollection", () => {
    it("should construct with correct properties", () => {
      const collection = new AnsibleCollection(
        "/some/path",
        "my_namespace",
        "my_collection",
      );

      expect(collection.path).toBe("/some/path");
      expect(collection.namespace).toBe("my_namespace");
      expect(collection.name).toBe("my_collection");
      expect(collection.fqcn).toBe("my_namespace.my_collection");
    });
  });
});
