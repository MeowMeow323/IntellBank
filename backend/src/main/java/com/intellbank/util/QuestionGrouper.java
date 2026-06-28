package com.intellbank.util;

import com.intellbank.entity.Question;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Regroups stored question sub-part fragments back into full exam questions.
 *
 * <p>OCR stores each leaf sub-part as its own {@code questions} row whose content starts
 * with a {@code [QPART:<question-no>:<part>]} marker (e.g. {@code [QPART:4:b-ii]}), and
 * sibling sub-parts repeat their shared stem. Rendering each row as a question turns one
 * 4-question paper into 13 questions. This merges all fragments of one original question
 * (same question number) into a single question body — parts a/b/c in order, with the
 * repeated stems de-duplicated — so the paper reads as 4 questions of 25 marks each.
 */
public final class QuestionGrouper {

    private QuestionGrouper() {}

    /** A reconstructed full question. */
    public record Composite(String content, int marks) {}

    private static final Pattern QPART =
            Pattern.compile("^\\s*\\[QPART:([^:\\]]+):([^\\]]+)\\]\\s*", Pattern.CASE_INSENSITIVE);

    private static final Map<String, Integer> ROMAN = Map.of(
            "i", 1, "ii", 2, "iii", 3, "iv", 4, "v", 5, "vi", 6, "vii", 7, "viii", 8);

    /** Group fragments into full questions, ordered by original question number. */
    public static List<Composite> group(List<Question> questions) {
        LinkedHashMap<String, List<Question>> groups = new LinkedHashMap<>();
        int solo = 0;
        for (Question q : questions) {
            String content = q.getContent() == null ? "" : q.getContent();
            Matcher m = QPART.matcher(content);
            String key = m.find() ? "q:" + m.group(1) : "solo:" + (solo++);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(q);
        }

        List<Map.Entry<String, List<Question>>> entries = new ArrayList<>(groups.entrySet());
        entries.sort(Comparator.comparingDouble(e -> groupOrder(e.getKey())));

        List<Composite> out = new ArrayList<>();
        for (Map.Entry<String, List<Question>> e : entries) {
            List<Question> frags = new ArrayList<>(e.getValue());
            frags.sort(Comparator.comparing(q -> partSortKey(extractPart(q.getContent()))));
            String merged = assemble(frags);
            if (!merged.isBlank()) out.add(new Composite(merged, 25));
        }
        return out;
    }

    private static double groupOrder(String key) {
        if (key.startsWith("q:")) {
            try {
                return Double.parseDouble(key.substring(2).replaceAll("[^0-9.]", ""));
            } catch (NumberFormatException ignored) { /* fall through */ }
        }
        return 1000.0 + (key.hashCode() & 0xff);
    }

    private static String extractPart(String content) {
        if (content == null) return "";
        Matcher m = QPART.matcher(content);
        return m.find() ? m.group(2) : "";
    }

    /** "a" → "a00", "a-i" → "a01", "b-ii" → "b02" so parts read a, b, c then i, ii … */
    private static String partSortKey(String part) {
        part = part == null ? "" : part.toLowerCase().trim();
        String[] bits = part.split("-");
        String letter = bits.length > 0 ? bits[0] : "";
        int sub = bits.length > 1 ? ROMAN.getOrDefault(bits[1], 0) : 0;
        return letter + String.format("%02d", sub);
    }

    /**
     * Concatenate a question's fragments, dropping the [QPART:…] markers and de-duplicating
     * repeated paragraph blocks (siblings such as (i)/(ii) restate the shared "b) …" stem).
     * [SCENARIO] and [TABLE] markers are preserved for the renderer to handle.
     */
    private static String assemble(List<Question> frags) {
        Set<String> seen = new HashSet<>();
        List<String> blocks = new ArrayList<>();
        for (Question q : frags) {
            String body = QPART.matcher(q.getContent() == null ? "" : q.getContent()).replaceFirst("");
            for (String block : body.split("\\n{2,}")) {
                String b = block.strip();
                if (b.isEmpty()) continue;
                String norm = b.replaceAll("\\s+", " ").toLowerCase();
                if (seen.add(norm)) blocks.add(b);
            }
        }
        return String.join("\n\n", blocks);
    }
}
