## Skip-Gram 训练数据生成

实现 `generate_skipgram_pairs(sentence, window)`：用中心词预测上下文。

---

### 函数签名

```python
def generate_skipgram_pairs(sentence: list[str], window: int) -> list[tuple[str, str]]:
    """返回 [(center, context), ...] 训练对"""
```

---

### 示例 1 — window=2

> **输入：**
> ```python
> sentence = ["我", "每天", "乘坐", "地铁", "上班"]
> generate_skipgram_pairs(sentence, window=2)
> ```
> **输出：** `14` 对训练样本
> **解释：**
> ```
> "我"(center)     → "每天", "乘坐"           (2 对)
> "每天"(center)   → "我", "乘坐", "地铁"     (3 对)
> "乘坐"(center)   → "我", "每天", "地铁", "上班" (4 对)
> "地铁"(center)   → "每天", "乘坐", "上班"   (3 对)
> "上班"(center)   → "乘坐", "地铁"           (2 对)
> 共 2+3+4+3+2 = 14 对
> ```

### 示例 2 — window=1

> **输入：** `generate_skipgram_pairs(sentence, window=1)`
> **输出：** `8` 对训练样本
> **解释：** 每个中心词只看左右各 1 个词。

### 示例 3 — 单词句

> **输入：** `generate_skipgram_pairs(["你好"], window=2)`
> **输出：** `[]`
> **解释：** 只有一个词，无上下文可取。

---

### 约束条件

- `1 <= len(sentence) <= 1000`
- `1 <= window <= len(sentence)`
- 边界处不够就取到边界为止（不补零、不报错）
- **不包含中心词自己**
- 返回顺序不限，但 `(center, context)` 对中顺序固定
