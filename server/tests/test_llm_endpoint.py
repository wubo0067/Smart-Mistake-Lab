"""llm.py 端点检测 / URL 归一化 的单元测试（不涉及真实 AI 调用）。

重点覆盖本地 OpenAI 兼容服务（Atomic Chat http://127.0.0.1:1337/v1、
LM Studio http://127.0.0.1:1234/v1）不被误判为 Ollama 原生协议。
"""
import os
import unittest
from unittest import mock

from llm import (
    PROTOCOL_ANTHROPIC,
    PROTOCOL_OLLAMA,
    PROTOCOL_OPENAI,
    build_analyze_request,
    detect_protocol,
    extract_text_from_response,
    extract_usage_from_response,
    normalize_api_url,
    should_require_api_key,
)
from llm import AiConfig, _model_context_tier

ATOMIC_CHAT_BASE = "http://127.0.0.1:1337/v1"

# 确保测试不受宿主 .env 中 AI_PROTOCOL 的影响
_NO_OVERRIDE = mock.patch.dict(os.environ, {"AI_PROTOCOL": ""})


@_NO_OVERRIDE
class DetectProtocolTests(unittest.TestCase):
    def test_atomic_chat_base_url_is_openai(self):
        self.assertEqual(detect_protocol(ATOMIC_CHAT_BASE), PROTOCOL_OPENAI)

    def test_atomic_chat_full_endpoint_is_openai(self):
        self.assertEqual(
            detect_protocol(f"{ATOMIC_CHAT_BASE}/chat/completions"), PROTOCOL_OPENAI
        )

    def test_atomic_chat_bare_root_is_openai(self):
        # 1337 是 Atomic Chat 默认端口，裸地址也应识别为 OpenAI 兼容而非 Ollama
        self.assertEqual(detect_protocol("http://127.0.0.1:1337"), PROTOCOL_OPENAI)

    def test_lm_studio_default_port_is_openai(self):
        self.assertEqual(detect_protocol("http://localhost:1234"), PROTOCOL_OPENAI)

    def test_ollama_root_is_ollama(self):
        self.assertEqual(detect_protocol("http://localhost:11434"), PROTOCOL_OLLAMA)

    def test_ollama_custom_port_root_is_ollama(self):
        self.assertEqual(detect_protocol("http://127.0.0.1:11500"), PROTOCOL_OLLAMA)

    def test_ollama_native_endpoint_is_ollama(self):
        self.assertEqual(
            detect_protocol("http://localhost:11434/api/chat"), PROTOCOL_OLLAMA
        )

    def test_anthropic_endpoint(self):
        self.assertEqual(
            detect_protocol("https://api.anthropic.com/v1/messages"),
            PROTOCOL_ANTHROPIC,
        )

    def test_cloud_base_url_is_openai(self):
        self.assertEqual(
            detect_protocol("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode"),
            PROTOCOL_OPENAI,
        )

    def test_env_override_applies_to_bare_custom_port(self):
        with mock.patch.dict(os.environ, {"AI_PROTOCOL": "openai"}):
            self.assertEqual(detect_protocol("http://127.0.0.1:9999"), PROTOCOL_OPENAI)

    def test_env_override_does_not_break_explicit_endpoint(self):
        with mock.patch.dict(os.environ, {"AI_PROTOCOL": "ollama"}):
            self.assertEqual(
                detect_protocol("https://api.deepseek.com/v1/chat/completions"),
                PROTOCOL_OPENAI,
            )


@_NO_OVERRIDE
class NormalizeApiUrlTests(unittest.TestCase):
    def test_atomic_chat_base_url_not_doubled(self):
        # 关键回归：不能再拼成 /v1/v1/chat/completions
        self.assertEqual(
            normalize_api_url(ATOMIC_CHAT_BASE),
            "http://127.0.0.1:1337/v1/chat/completions",
        )

    def test_atomic_chat_base_url_with_trailing_slash(self):
        self.assertEqual(
            normalize_api_url(f"{ATOMIC_CHAT_BASE}/"),
            "http://127.0.0.1:1337/v1/chat/completions",
        )

    def test_atomic_chat_bare_root(self):
        self.assertEqual(
            normalize_api_url("http://127.0.0.1:1337"),
            "http://127.0.0.1:1337/v1/chat/completions",
        )

    def test_full_endpoint_kept_unchanged(self):
        url = f"{ATOMIC_CHAT_BASE}/chat/completions"
        self.assertEqual(normalize_api_url(url), url)

    def test_ollama_root_completed_with_api_chat(self):
        self.assertEqual(
            normalize_api_url("http://localhost:11434"),
            "http://localhost:11434/api/chat",
        )

    def test_ollama_native_endpoint_kept_unchanged(self):
        url = "http://localhost:11434/api/chat"
        self.assertEqual(normalize_api_url(url), url)

    def test_anthropic_endpoint_kept_unchanged(self):
        url = "https://api.anthropic.com/v1/messages"
        self.assertEqual(normalize_api_url(url), url)

    def test_cloud_base_url_completed_with_v1_chat_completions(self):
        self.assertEqual(
            normalize_api_url("https://api.deepseek.com"),
            "https://api.deepseek.com/v1/chat/completions",
        )

    def test_proxied_v1_base_url_not_doubled(self):
        self.assertEqual(
            normalize_api_url("https://my-gateway.example.com/openai/v1"),
            "https://my-gateway.example.com/openai/v1/chat/completions",
        )

    def test_compatible_mode_path_still_openai_default(self):
        self.assertEqual(
            normalize_api_url("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode"),
            "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
        )

    def test_env_override_openai_on_custom_port(self):
        with mock.patch.dict(os.environ, {"AI_PROTOCOL": "openai"}):
            self.assertEqual(
                normalize_api_url("http://127.0.0.1:9999"),
                "http://127.0.0.1:9999/v1/chat/completions",
            )

    def test_env_override_ollama_on_custom_port(self):
        with mock.patch.dict(os.environ, {"AI_PROTOCOL": "ollama"}):
            self.assertEqual(
                normalize_api_url("http://127.0.0.1:9999"),
                "http://127.0.0.1:9999/api/chat",
            )

    def test_empty_url(self):
        self.assertEqual(normalize_api_url("   "), "")


@_NO_OVERRIDE
class AtomicChatRequestAndResponseTests(unittest.TestCase):
    """Atomic Chat 归一化后必须走 OpenAI 兼容分支，而不是 Ollama 分支。"""

    def setUp(self):
        self.api_url = normalize_api_url(ATOMIC_CHAT_BASE)
        self.config = AiConfig(
            api_url=ATOMIC_CHAT_BASE,
            model="deepseek-r1:7b",
            api_key="",
            max_tokens=4096,
        )

    def test_request_uses_openai_chat_completions_body(self):
        request = build_analyze_request(
            self.config,
            self.api_url,
            "data:image/jpeg;base64,AAAA",
            "AAAA",
            "识别题目",
        )
        body = request["body"]
        # OpenAI 兼容字段
        self.assertEqual(body["model"], "deepseek-r1:7b")
        self.assertEqual(body["max_tokens"], 4096)
        # 不得混入 Ollama 原生字段
        self.assertNotIn("options", body)
        self.assertNotIn("think", body)
        content = body["messages"][0]["content"]
        self.assertEqual(content[0], {"type": "text", "text": "识别题目"})
        self.assertEqual(
            content[1],
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}},
        )

    def test_text_response_parsed_as_openai(self):
        data = {"choices": [{"message": {"content": '{"ok": true}'}}]}
        self.assertEqual(
            extract_text_from_response(data, self.api_url), '{"ok": true}'
        )

    def test_ollama_shape_response_is_not_used(self):
        # Ollama 形状的响应在 OpenAI 协议下不应被解析出内容
        data = {"message": {"content": '{"ok": true}'}}
        self.assertEqual(extract_text_from_response(data, self.api_url), "")

    def test_usage_parsed_from_openai_usage_field(self):
        data = {
            "usage": {
                "prompt_tokens": 12,
                "completion_tokens": 34,
                "total_tokens": 46,
            }
        }
        self.assertEqual(
            extract_usage_from_response(data, self.api_url),
            {"prompt": 12, "completion": 34, "total": 46, "cached": 0},
        )

    def test_ollama_usage_keys_ignored_for_atomic_chat(self):
        data = {"prompt_eval_count": 12, "eval_count": 34}
        self.assertEqual(
            extract_usage_from_response(data, self.api_url),
            {"prompt": 0, "completion": 0, "total": 0, "cached": 0},
        )

    def test_local_endpoint_uses_small_token_budget_tier(self):
        self.assertEqual(
            _model_context_tier("qwen3.8:27b-mtp-q4_K_M", self.api_url), "small"
        )

    def test_api_key_not_required(self):
        self.assertFalse(should_require_api_key(self.api_url))


class OllamaRegressionTests(unittest.TestCase):
    """既有 Ollama 配置行为不变。"""

    def setUp(self):
        self.api_url = normalize_api_url("http://localhost:11434")
        self.config = AiConfig(
            api_url="http://localhost:11434", model="qwen3-vl:8b", max_tokens=2048
        )

    def test_request_uses_ollama_native_body(self):
        request = build_analyze_request(
            self.config, self.api_url, "data:image/jpeg;base64,AAAA", "AAAA", "识别题目"
        )
        body = request["body"]
        self.assertIs(body["stream"], False)
        self.assertIs(body["think"], False)
        self.assertEqual(body["options"], {"num_predict": 2048})
        self.assertEqual(body["messages"][0]["images"], ["AAAA"])

    def test_text_response_parsed_as_ollama(self):
        data = {"message": {"content": '{"ok": true}'}}
        self.assertEqual(extract_text_from_response(data, self.api_url), '{"ok": true}')

    def test_usage_parsed_from_ollama_fields(self):
        data = {"prompt_eval_count": 5, "eval_count": 7}
        self.assertEqual(
            extract_usage_from_response(data, self.api_url),
            {"prompt": 5, "completion": 7, "total": 12, "cached": 0},
        )

    def test_api_key_not_required(self):
        self.assertFalse(should_require_api_key(self.api_url))


class AnthropicRegressionTests(unittest.TestCase):
    def setUp(self):
        self.api_url = "https://api.anthropic.com/v1/messages"

    def test_api_key_required(self):
        self.assertTrue(should_require_api_key(self.api_url))

    def test_text_response_parsed_as_anthropic(self):
        data = {"content": [{"type": "text", "text": "hello"}]}
        self.assertEqual(extract_text_from_response(data, self.api_url), "hello")


if __name__ == "__main__":
    unittest.main()
