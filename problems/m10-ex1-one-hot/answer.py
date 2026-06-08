import numpy as np

def one_hot(word, vocab):
    vec = np.zeros(len(vocab))
    if word in vocab:
        idx = vocab.index(word)
        vec[idx] = 1
    return vec

def cosine_sim(v1, v2):
    dot = np.dot(v1, v2)
    norm = np.linalg.norm(v1) * np.linalg.norm(v2)
    return dot / norm
