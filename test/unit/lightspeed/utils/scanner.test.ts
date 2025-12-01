import assert from "assert";
import { PROJECT_ROOT } from "../../../setup";
import { CollectionFinder } from "../../../../src/features/lightspeed/utils/scanner";

describe(__filename, function () {
  describe("Playbook project", function () {
    it("Should find the collections", async function () {
      const collectionFinder = new CollectionFinder([
        PROJECT_ROOT + "/test/unit/lightspeed/utils/samples",
      ]);
      await collectionFinder.refreshCache();

      assert.equal(collectionFinder.cache.length, 4);
      assert.equal(collectionFinder.cache[0].namespace, "community");
      assert.equal(collectionFinder.cache[0].name, "dummy");

      assert.equal(collectionFinder.cache[1].namespace, "community");
      assert.equal(collectionFinder.cache[1].name, "general");

      assert.equal(collectionFinder.cache[2].namespace, "openstack");
      assert.equal(collectionFinder.cache[2].name, "cloud");

      assert.equal(collectionFinder.cache[3].namespace, "virt_lightning");
      assert.equal(collectionFinder.cache[3].name, "virt_lightning");
    });
  });

  describe("Collection project", function () {
    it("Should find the project collection", async function () {
      const collectionFinder = new CollectionFinder([
        PROJECT_ROOT +
          "/test/unit/lightspeed/utils/samples/collections/ansible_collections/community/dummy",
      ]);
      await collectionFinder.refreshCache();

      assert.equal(collectionFinder.cache.length, 1);
      assert.equal(collectionFinder.cache[0].namespace, "community");
      assert.equal(collectionFinder.cache[0].name, "dummy");
    });
  });
});
