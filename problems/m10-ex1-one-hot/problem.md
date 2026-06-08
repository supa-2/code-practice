## One-Hot 编码 + 余弦相似度

补全 `one_hot()` 和 `cosine_sim()` 两个函数。

---

### 函数签名

```python
def one_hot(word: str, vocab: list[str]) -> np.ndarray:
    """返回 shape 为 (len(vocab),) 的 one-hot 向量"""

def cosine_sim(v1: np.ndarray, v2: np.ndarray) -> float:
    """返回余弦相似度，范围 [-1, 1]"""
```

---

### 示例 1 — 基本编码

> **输入：**
> ```python
> vocab = ["我", "喜欢", "乘坐", "地铁", "公交", "上班"]
> one_hot("地铁", vocab)
> ```
> **输出：** `array([0, 0, 0, 1, 0, 0])`
> **解释：** "地铁" 在 vocab 中索引为 3，对应位置为 1，其余为 0。

### 示例 2 — 词不在词表中

> **输入：** `one_hot("火车", vocab)`
> **输出：** `array([0, 0, 0, 0, 0, 0])`
> **解释：** "火车" 不在 vocab 中，返回全零向量。

### 示例 3 — 余弦相似度

> **输入：**
> ```python
> cosine_sim(one_hot("地铁", vocab), one_hot("公交", vocab))  # → 0.0
> cosine_sim(one_hot("地铁", vocab), one_hot("地铁", vocab))  # → 1.0
> ```
> **输出：** `0.0` 和 `1.0`
> **解释：** 不同词的 one-hot 向量正交（相似度 0），自身相似度为 1。

---

### 约束条件

- `vocab` 长度 `1 <= len(vocab) <= 10000`
- 返回值必须是 `np.ndarray` 类型
- 不在词表中的词返回全零向量，**不抛异常**
- `cosine_sim` 中如果任一向量为零向量，返回 `0.0`
