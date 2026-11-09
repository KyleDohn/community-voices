import { z } from 'zod';

// Only the fields we use. zod strips the rest, which is also how the fixture recorder trims responses.

export const SiteSchema = z.object({
  categories: z.array(
    z.object({ id: z.number(), name: z.string(), parent_category_id: z.number().nullish() }),
  ),
});

export const LatestSchema = z.object({
  topic_list: z.object({
    more_topics_url: z.string().nullish(),
    topics: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        bumped_at: z.iso.datetime(),
        pinned: z.boolean().default(false),
      }),
    ),
  }),
});

export const PostSchema = z.object({
  id: z.number(),
  topic_id: z.number(),
  post_number: z.number(),
  /** 1 = regular; 2–4 are moderator actions, small actions and whispers. */
  post_type: z.number(),
  username: z.string(),
  /** Absent on posts the community flagged and hid. */
  raw: z.string().optional(),
  /** Rendered HTML; only read for its uploaded images. */
  cooked: z.string().optional(),
  hidden: z.boolean().default(false),
  created_at: z.iso.datetime(),
});

export const TopicSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  category_id: z.number(),
  created_at: z.iso.datetime(),
  post_stream: z.object({ posts: z.array(PostSchema), stream: z.array(z.number()) }),
});

export const TopicPostsSchema = z.object({
  post_stream: z.object({ posts: z.array(PostSchema) }),
});

export type DiscoursePost = z.infer<typeof PostSchema>;
