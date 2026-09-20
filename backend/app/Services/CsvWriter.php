<?php

namespace App\Services;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Builds the CSV downloads an organizer opens in Excel.
 *
 * Two details that are not optional here. A UTF-8 byte-order mark, because
 * without it Excel on Windows reads a Malayalam team name as mojibake and the
 * rupee sign as two characters. And a leading apostrophe on anything Excel would
 * otherwise reinterpret — a phone number like `+919447098765` becomes a formula,
 * and `9447098765` becomes `9.4471E+09`.
 */
class CsvWriter
{
    /**
     * @param  array<int, string>  $headings
     * @param  iterable<int, array<int, string|int|float|null>>  $rows
     */
    public function download(string $filename, array $headings, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headings, $rows) {
            $handle = fopen('php://output', 'wb');

            // Excel needs to be told the file is UTF-8.
            fwrite($handle, "\xEF\xBB\xBF");

            fputcsv($handle, $headings);

            foreach ($rows as $row) {
                fputcsv($handle, array_map([$this, 'cell'], $row));
            }

            fclose($handle);
        }, $this->safeFilename($filename), [
            'Content-Type' => 'text/csv; charset=UTF-8',
            // Stops a proxy handing back a cached copy of last week's figures.
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    /**
     * Keep a value as text where a spreadsheet would mangle it.
     *
     * Anything opening with `=`, `+`, `-` or `@` is a formula to Excel, which is
     * both wrong here and the classic CSV injection route — a team name typed as
     * `=HYPERLINK(...)` should never execute in the organizer's spreadsheet.
     */
    private function cell(string|int|float|null $value): string
    {
        $value = (string) ($value ?? '');

        if ($value === '') {
            return '';
        }

        if (in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'".$value;
        }

        // A long run of digits is an identifier or a phone number, never a
        // quantity — Excel would round it into scientific notation.
        if (preg_match('/^\d{11,}$/', $value)) {
            return "'".$value;
        }

        return $value;
    }

    private function safeFilename(string $filename): string
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]+/', '-', $filename) ?? 'export.csv';

        return trim($safe, '-') ?: 'export.csv';
    }
}
