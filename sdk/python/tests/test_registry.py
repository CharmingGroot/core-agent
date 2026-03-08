"""Tests for Registry."""

import pytest
from chameleon import Registry, RegistryError


def test_register_and_get():
    r: Registry[str] = Registry("test")
    r.register("a", "hello")
    assert r.get("a") == "hello"


def test_try_get_returns_none_for_missing():
    r: Registry[str] = Registry("test")
    assert r.try_get("missing") is None


def test_duplicate_register_raises():
    r: Registry[str] = Registry("test")
    r.register("a", "hello")
    with pytest.raises(RegistryError, match="already registered"):
        r.register("a", "world")


def test_get_missing_raises():
    r: Registry[str] = Registry("test")
    with pytest.raises(RegistryError, match="not registered"):
        r.get("missing")


def test_unregister():
    r: Registry[str] = Registry("test")
    r.register("a", "hello")
    r.unregister("a")
    assert r.try_get("a") is None


def test_unregister_missing_raises():
    r: Registry[str] = Registry("test")
    with pytest.raises(RegistryError, match="not registered"):
        r.unregister("missing")


def test_get_all():
    r: Registry[str] = Registry("test")
    r.register("a", "1")
    r.register("b", "2")
    assert r.get_all() == {"a": "1", "b": "2"}


def test_get_all_names():
    r: Registry[str] = Registry("test")
    r.register("x", "1")
    r.register("y", "2")
    assert set(r.get_all_names()) == {"x", "y"}


def test_len():
    r: Registry[str] = Registry("test")
    assert len(r) == 0
    r.register("a", "1")
    assert len(r) == 1


def test_contains():
    r: Registry[str] = Registry("test")
    r.register("a", "1")
    assert "a" in r
    assert "b" not in r


def test_register_after_unregister():
    r: Registry[str] = Registry("test")
    r.register("a", "v1")
    r.unregister("a")
    r.register("a", "v2")
    assert r.get("a") == "v2"
