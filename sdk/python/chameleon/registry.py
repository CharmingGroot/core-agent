"""
Registry — Generic named-item store with runtime register/unregister.
Python port of @cli-agent/core Registry<T>.
"""

from __future__ import annotations

from typing import Generic, TypeVar

T = TypeVar("T")


class RegistryError(Exception):
    pass


class Registry(Generic[T]):
    """Thread-safe registry for named components."""

    def __init__(self, label: str = "Registry") -> None:
        self._label = label
        self._items: dict[str, T] = {}

    def register(self, name: str, item: T) -> None:
        if name in self._items:
            raise RegistryError(f"{self._label} '{name}' is already registered")
        self._items[name] = item

    def get(self, name: str) -> T:
        item = self._items.get(name)
        if item is None:
            raise RegistryError(f"{self._label} '{name}' is not registered")
        return item

    def try_get(self, name: str) -> T | None:
        return self._items.get(name)

    def get_all(self) -> dict[str, T]:
        return dict(self._items)

    def get_all_names(self) -> list[str]:
        return list(self._items.keys())

    def unregister(self, name: str) -> bool:
        if name not in self._items:
            raise RegistryError(f"{self._label} '{name}' is not registered")
        del self._items[name]
        return True

    def __len__(self) -> int:
        return len(self._items)

    def __contains__(self, name: str) -> bool:
        return name in self._items
