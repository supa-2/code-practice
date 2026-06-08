## Embedding 层模拟

补全 `lookup()` 和 `most_similar()`：

1. `lookup(embedding, vocab, word)` — 从矩阵中查出词向量
2. `most_similar(embedding, vocab, target_vec, exclude=[])` — 余弦相似度最高的词

---

### 函数签名

```python
def lookup(embedding: np.ndarray, vocab: list[str], word: str) -> np.ndarray:
    """从 embedding 矩阵中查出 word 对应的行向量"""

def most_similar(embedding: np.ndarray, vocab: list[str],
                 target_vec: np.ndarray, exclude: list[str] = []) -> str:
    """返回与 target_vec 余弦相似度最高的词（排除 exclude 中的词）"""
```

---

### 示例 1 — lookup 基本功能

> **输入：**
> ```python
> vocab = ["猫", "狗", "汽车", "火车", "苹果", "香蕉", "电脑", "手机"]
> embedding = np.random.randn(len(vocab), 10)  # shape=(8, 10)
> vec = lookup(embedding, vocab, "汽车")
> ```
> **输出：** `E[2]`（shape=`(10,)`）
> **解释：** "汽车" 在 vocab 中索引为 2，`lookup` 就是取出 `embedding[2]`。

### 示例 2 — 不排除自己找最近

> **输入：**
> ```python
> most_similar(embedding, vocab, embedding[0], exclude=[])
> ```
> **输出：** `"猫"`
> **解释：** `embedding[0]` 是 "猫" 的向量，与自身余弦相似度 = 1.0，自然最高。

### 示例 3 — 排除自己后找最近

> **输入：**
> ```python
> most_similar(embedding, vocab, embedding[0], exclude=["猫"])
> ```
> **输出：** 最近邻词（如 `"狗"` 等）
> **解释：** 排除 "猫" 后，在剩余词中找余弦相似度最高的。

---

### 约束条件

- `embedding` 是 `np.ndarray`，shape = `(vocab_size, dim)`
- `1 <= vocab_size <= 10000`, `1 <= dim <= 1000`
- `lookup` 就是取出对应行，`vocab.index(word)` 定位
- `most_similar` 遍历所有词算余弦相似度，排除 `exclude` 里的
- `exclude` 可能包含词表中不存在的词（跳过即可）
- 如果 `exclude` 排除了所有词，返回空字符串 `""`
