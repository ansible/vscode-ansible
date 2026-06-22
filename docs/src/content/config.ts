import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    docs: defineCollection({ schema: docsSchema() }),
};
