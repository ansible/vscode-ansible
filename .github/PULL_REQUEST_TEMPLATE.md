## Summary

<!-- Conventional commit style title in PR name, e.g. feat(ci): ... -->

## Test plan

- [ ] `task lint`
- [ ] `task test` (or relevant subsets)

### ALS / VSIX packaging (AAP-97287)

Related RCA: [AAP-93529](https://redhat.atlassian.net/browse/AAP-93529).

```bash
task build
task package
npm exec -- vitest run test/unit/als/alsPackaging.test.ts
node tools/smoke-als-vsix.mts
```

## Issue references

```
(related): AAP-93529
(fixes|closes): AAP-97287
```
