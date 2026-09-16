<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AssistantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssistantController extends Controller
{
    public function __construct(private readonly AssistantService $assistant) {}

    /**
     * One chat turn. The browser keeps the conversation and sends the visible
     * history each time; the last message must be the user's new question.
     */
    public function chat(Request $request): JsonResponse
    {
        if (! $this->assistant->isConfigured()) {
            return response()->json(['error' => 'The assistant is not available right now'], 503);
        }

        $data = $request->validate([
            'messages' => ['required', 'array', 'min:1', 'max:30'],
            'messages.*.role' => ['required', 'string', 'in:user,assistant'],
            'messages.*.content' => ['required', 'string', 'max:2000'],
        ]);

        $messages = array_values($data['messages']);

        if ($messages[0]['role'] !== 'user' || end($messages)['role'] !== 'user') {
            return response()->json(['error' => 'The conversation must start and end with a user message'], 422);
        }

        $reply = $this->assistant->reply($messages);

        if (! $reply) {
            return response()->json(['error' => 'The assistant could not answer right now. Please try again.'], 502);
        }

        return response()->json($reply);
    }
}
