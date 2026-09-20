<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Makes bearer tokens revocable.
 *
 * The tokens are stateless HS256 JWTs, so until now nothing could cut one
 * short: signing out only dropped it from the browser, and a stolen token
 * stayed good for its full seven days. Two mechanisms, deliberately:
 *
 *   - `revoked_tokens` denylists one token by its `jti`, for signing out of a
 *     single session and for ending an impersonation. Rows are only meaningful
 *     until the token would have expired anyway, so `expires_at` carries that
 *     moment and spent rows are pruned on write.
 *   - `users.token_version` revokes every token a user holds at once. Each
 *     token carries the version it was issued under and is refused once that
 *     number moves on. It is what a password change, a "sign out everywhere"
 *     and a suspended organization use — none of which know the individual
 *     tokens they need to kill.
 *
 * A counter rather than a cut-off timestamp on purpose: `iat` is only accurate
 * to the second, so a timestamp cannot tell a token issued a moment before the
 * revocation from the replacement issued a moment after it. A version can.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('revoked_tokens', function (Blueprint $table) {
            // The token's own `jti` claim is the key: one row per revoked token.
            $table->string('jti')->primary();
            $table->string('user_id')->index();
            // When the token would have expired on its own, after which this
            // row can be dropped — nothing can present the token any more.
            $table->unsignedBigInteger('expires_at')->index();
            $table->timestamp('created_at')->nullable();
        });

        Schema::table('users', function (Blueprint $table) {
            // Every token names the version it was issued under; bumping this
            // refuses all of them at once, including tokens on devices this
            // server has no record of.
            $table->unsignedInteger('token_version')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('token_version');
        });

        Schema::dropIfExists('revoked_tokens');
    }
};
