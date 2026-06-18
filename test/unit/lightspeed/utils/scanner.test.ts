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

      expect(finder.cache.length).toBe(4);
      expect(finder.initialized).toBe(true);
    });

    it("should sort collections alphabetically by FQCN", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      await finder.refreshCache();

      const names = finder.cache.map((c) => c.fqcn);
      expect(names).toEqual([...names].sort());
    });
  });

  describe("searchNestedCollections", () => {
    it("should traverse namespace directories and find collections", async () => {
      const finder = new CollectionFinder([SAMPLES_PATH]);
      const collections = await finder.searchNestedCollections();

      expect(collections.length).toBe(4);
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
