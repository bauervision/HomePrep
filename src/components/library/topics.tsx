import {
  BookOpen,
  Droplet,
  House,
  Radio,
  SoapDispenserDroplet,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";
import type { LibraryTopic } from "@/lib/library/types";

/*
 * Library topic styling, keyed by stable topic ID so it survives label
 * changes. Every cue pairs an icon and the visible label with the accent, so
 * a topic is recognizable without color. Unknown or research-only topics get
 * the neutral style. Class names are literal so Tailwind can see them.
 */

export interface TopicStyle {
  icon: LucideIcon;
  /** Accent text (icon and label). */
  text: string;
  /** Card edge and tint. */
  card: string;
  /** Unselected pill border. */
  pill: string;
  /** Selected pill: tint, border and outline. */
  selected: string;
}

export const TOPIC_STYLE: Record<string, TopicStyle> = {
  water: {
    icon: Droplet,
    text: "text-sky-300",
    card: "border-l-sky-400/70 bg-sky-400/[0.035]",
    pill: "border-sky-400/35",
    selected: "border-sky-300 bg-sky-400/15 outline-sky-300/60",
  },
  food: {
    icon: Utensils,
    text: "text-lime-300",
    card: "border-l-lime-400/70 bg-lime-400/[0.035]",
    pill: "border-lime-400/35",
    selected: "border-lime-300 bg-lime-400/15 outline-lime-300/60",
  },
  power: {
    icon: Zap,
    text: "text-amber-300",
    card: "border-l-amber-400/70 bg-amber-400/[0.035]",
    pill: "border-amber-400/35",
    selected: "border-amber-300 bg-amber-400/15 outline-amber-300/60",
  },
  sanitation: {
    icon: SoapDispenserDroplet,
    text: "text-teal-300",
    card: "border-l-teal-400/70 bg-teal-400/[0.035]",
    pill: "border-teal-400/35",
    selected: "border-teal-300 bg-teal-400/15 outline-teal-300/60",
  },
  communications: {
    icon: Radio,
    text: "text-violet-300",
    card: "border-l-violet-400/70 bg-violet-400/[0.035]",
    pill: "border-violet-400/35",
    selected: "border-violet-300 bg-violet-400/15 outline-violet-300/60",
  },
  shelter: {
    icon: House,
    text: "text-rose-300",
    card: "border-l-rose-400/70 bg-rose-400/[0.035]",
    pill: "border-rose-400/35",
    selected: "border-rose-300 bg-rose-400/15 outline-rose-300/60",
  },
};

export const NEUTRAL_TOPIC: TopicStyle = {
  icon: BookOpen,
  text: "text-sage",
  card: "border-l-line-strong",
  pill: "border-line",
  selected: "border-line-strong bg-white/[0.07] outline-line-strong",
};

export const topicStyle = (id: string | undefined) =>
  (id && TOPIC_STYLE[id]) || NEUTRAL_TOPIC;

/** The entry's first topic with a style, else its first topic. */
export function primaryTopic(topicIds: string[]) {
  return topicIds.find((id) => TOPIC_STYLE[id]) ?? topicIds[0];
}

/** Icon + visible label in the topic's accent. */
export function TopicLabel({
  id,
  topics,
  className,
}: {
  id: string | undefined;
  topics: LibraryTopic[];
  className?: string;
}) {
  if (!id) return null;
  const s = topicStyle(id);
  const Icon = s.icon;
  const label = topics.find((t) => t.id === id)?.label ?? id;
  return (
    <span
      data-topic={id}
      className={cx(
        "inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] uppercase",
        s.text,
        className,
      )}
    >
      <Icon size={14} aria-hidden className="shrink-0" />
      {label}
    </span>
  );
}
