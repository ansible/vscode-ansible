# Development

## Marketplace admin interface

The current link to edit the extension presence on the marketplace is
https://marketplace.visualstudio.com/manage/publishers/zbr

## Package extension

```shell
vsce package
```

## Publish extension

Obviously that you need to be able to publish, likely you will
need to run `vsce login zbr` first (needs publisher name).

```shell
vsce publish
```

As it is likely thaty your not logged in or your PAT is expired, the magic
url to visit to regenerate one should be something like:

https://dev.azure.com/ssbarnea/_usersSettings/tokens

When creating a PAT, the Scopes needed are Marketplace Acquire + Publish.

The funny bit is you need to give access to "All organizations" because
the only organization listed there was "ssbarnea", which produced a token
that gave 401 (access denied).

The entire authentication experience with the Marketpalce is awful and will
likely never be able to understan what was on their mind when they implemented
it. Intead of providing an option to generate access tokens from the
Marketplace manage interface, they managed to make it huge PITA.
