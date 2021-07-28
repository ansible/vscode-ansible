# Development

## Marketplace admin interface

The current link to edit the extension presence on the marketplace is
https://marketplace.visualstudio.com/manage/publishers/redhat

## Package extension

```shell
vsce package
```

## Publish extension

Obviously that you need to be able to publish, likely you will
need to run `vsce login redhat` first (needs publisher name).

```shell
vsce publish
```

As it is likely that you are not logged in or your PAT is expired, the magic
url to visit to regenerate one should be something like:

https://dev.azure.com/USERNAME/_usersSettings/tokens

When creating a PAT, the Scopes needed are Marketplace Acquire + Publish.

The funny bit is you need to give access to "All organizations" because
the only organization listed there was "myuser", which produced a token
that gave 401 (access denied).
