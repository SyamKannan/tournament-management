<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * One page of a list, in one shape.
 *
 * Every long list in this application used to return the whole table. That
 * fails in both directions: an unbounded `get()` eventually hangs the browser,
 * and a hard `limit(50)` silently truncates so a search box quietly stops
 * finding things that exist. Both are the same missing feature.
 *
 * The envelope is deliberately flat and always present, so a client can render
 * "showing 1-25 of 812" and a pager without special-casing anything:
 *
 *     { data: [...], page, per_page, total, total_pages, has_more }
 *
 * Filtering belongs in the query *before* it gets here — a page of results is
 * only honest if the database did the filtering.
 */
final class Paginate
{
    public const DEFAULT_PER_PAGE = 25;

    public const MAX_PER_PAGE = 200;

    /**
     * Page a query builder, reading `page` and `per_page` off the request.
     *
     * @param  callable(mixed): mixed|null  $transform  applied to each row
     * @return array<string, mixed>
     */
    public static function query(
        EloquentBuilder|QueryBuilder $query,
        Request $request,
        ?callable $transform = null,
        int $defaultPerPage = self::DEFAULT_PER_PAGE,
    ): array {
        $page = self::page($request);
        $perPage = self::perPage($request, $defaultPerPage);

        // Counted before the page is taken, so `total` describes the whole
        // filtered set rather than the slice.
        $total = (clone $query)->count();

        $rows = $query->forPage($page, $perPage)->get();

        return self::envelope(
            $transform ? $rows->map($transform)->values() : $rows,
            $page,
            $perPage,
            $total,
        );
    }

    /**
     * Page an in-memory collection, for lists assembled in PHP rather than
     * queried (a join across services, a derived leaderboard).
     *
     * @return array<string, mixed>
     */
    public static function collection(
        Collection $items,
        Request $request,
        int $defaultPerPage = self::DEFAULT_PER_PAGE,
    ): array {
        $page = self::page($request);
        $perPage = self::perPage($request, $defaultPerPage);

        return self::envelope(
            $items->slice(($page - 1) * $perPage, $perPage)->values(),
            $page,
            $perPage,
            $items->count(),
        );
    }

    /** @return array<string, mixed> */
    public static function envelope(mixed $data, int $page, int $perPage, int $total): array
    {
        $totalPages = $perPage > 0 ? (int) ceil($total / $perPage) : 1;

        return [
            'data' => $data,
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => max($totalPages, 1),
            'has_more' => $page * $perPage < $total,
        ];
    }

    public static function page(Request $request): int
    {
        return max(1, (int) $request->query('page', 1));
    }

    public static function perPage(Request $request, int $default = self::DEFAULT_PER_PAGE): int
    {
        $perPage = (int) $request->query('per_page', $default);

        if ($perPage < 1) {
            $perPage = $default;
        }

        // A caller asking for everything is how the unbounded query comes
        // back, so the ceiling is enforced here rather than trusted.
        return min($perPage, self::MAX_PER_PAGE);
    }

    /**
     * Apply a case-insensitive match across several columns.
     *
     * Searching has to happen in the database — a client filtering the page it
     * was given can only ever find what already arrived, which is exactly the
     * bug this class exists to remove.
     *
     * `LIKE` wildcards in the term are escaped so a literal `%` searches for
     * itself. The escape character is `!` rather than a backslash: MySQL reads
     * a backslash inside a string literal as an escape of its own, so
     * `ESCAPE '\'` is a syntax error there while being correct in SQLite.
     * `!` means the same thing to every driver this app supports.
     *
     * @param  array<int, string>  $columns
     */
    public static function search(mixed $query, ?string $term, array $columns): mixed
    {
        $term = trim((string) $term);

        if ($term === '' || $columns === []) {
            return $query;
        }

        $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($term));
        $needle = '%'.$escaped.'%';

        // Quoted through the connection's own grammar: a column such as `to`
        // is a reserved word, and a bare name in raw SQL is a syntax error.
        $base = $query instanceof EloquentBuilder ? $query->getQuery() : $query;
        $grammar = $base->getGrammar();

        return $query->where(function ($inner) use ($columns, $needle, $grammar) {
            foreach ($columns as $column) {
                $inner->orWhereRaw(
                    'LOWER('.$grammar->wrap($column).") LIKE ? ESCAPE '!'",
                    [$needle],
                );
            }
        });
    }
}
