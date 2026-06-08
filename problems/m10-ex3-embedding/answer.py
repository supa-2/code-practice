import numpy as np

def lookup(embedding, vocab, word):
    idx = vocab.index(word)
    return embedding[idx]

def most_similar(embedding, vocab, target_vec, exclude=None):
    if exclude is None:
        exclude = []
    best_word = None
    best_sim = -2
    for i, w in enumerate(vocab):
        if w in exclude:
            continue
        sim = np.dot(target_vec, embedding[i]) / (np.linalg.norm(target_vec) * np.linalg.norm(embedding[i]))
        if sim > best_sim:
            best_sim = sim
            best_word = w
    return best_word
