// ======================================================
// CREATE NEWS (ADMIN ONLY)
// ======================================================
app.post("/api/news/create", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(403).json({ message: "Token missing" });

    try {
        const user = jwt.verify(token, secretKey);
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin only" });
        }

        const { title, content, image, category } = req.body;

        const [result] = await db.query(
            "INSERT INTO news(title, content, image, category) VALUES (?, ?, ?, ?)",
            [title, content, image, category]
        );

        res.status(201).json({
            id: result.insertId,
            title,
            content,
            image,
            category
        });

    } catch (error) {
        res.status(500).json({ message: "Error creating news" });
    }
});

// ======================================================
// UPDATE NEWS (ADMIN ONLY)
// ======================================================
app.put("/api/news/:id", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(403).json({ message: "Token missing" });

    try {
        const user = jwt.verify(token, secretKey);
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin only" });
        }

        const newsId = req.params.id;
        const { title, content, image, category } = req.body;

        await db.query(
            "UPDATE news SET title=?, content=?, image=?, category=? WHERE id=?",
            [title, content, image, category, newsId]
        );

        res.status(200).json({ message: "News updated" });

    } catch (error) {
        res.status(500).json({ message: "Error updating news" });
    }
});

// ======================================================
// DELETE NEWS (ADMIN ONLY)
// ======================================================
app.delete("/api/news/:id", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(403).json({ message: "Token missing" });

    try {
        const user = jwt.verify(token, secretKey);
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin only" });
        }

        const newsId = req.params.id;

        await db.query("DELETE FROM news WHERE id=?", [newsId]);

        res.status(200).json({ message: "News deleted" });

    } catch (error) {
        res.status(500).json({ message: "Error deleting news" });
    }
});