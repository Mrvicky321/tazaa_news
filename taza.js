const express = require("express");
const db = require("./db");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());

const secretKey = "ghdfjjgi9ew8865w";

// ======================================================
// USER LIST
// ======================================================
app.get("/api/user", async (request, response) => {
    const [result] =await db.query("SELECT * FROM users");
    response.status(200).json(result);
});

// ======================================================
// USER REGISTER
// ======================================================
app.post("/api/user/register", async (request, response) => {
    const name = request.body.name;
    const email = request.body.email;
    const password = request.body.password;

    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const [result] = await db.query(
            "INSERT INTO users(name, email, password) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        response.status(201).json({
            id: result.insertId,
            name: name,
            email: email,
            role: "user"
        });

    } catch (error) {
        if (error.errno === 1062) {
            return response.status(409).json({ message: "Email already registered" });
        }
        return response.status(500).json({ message: "Internal server error" });
    }
});

// ======================================================
// USER LOGIN
// ======================================================
app.post("/api/user/login", async (request, response) => {
    const email = request.body.email;
    const password = request.body.password;

    try {
        const [result] = await db.query(
            "SELECT id, name, email, password, role FROM users WHERE email=?",
            [email]
        );

        if (result.length === 0) {
            return response.status(401).json({ message: "Invalid email or password" });
        }

        const user = result[0];
        const isPasswordSame = await bcrypt.compare(password, user.password);

        if (isPasswordSame) {
            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, role: user.role },
                secretKey,
                { expiresIn: "1h" }
            );

            return response.status(200).json({
                message: "Login successful",
                token: token
            });
        } else {
            return response.status(401).json({ message: "Invalid email or password" });
        }

    } catch (error) {
        return response.status(500).json({ message: "Internal server error" });
    }
});

// ======================================================
// GET ALL NEWS
// ======================================================
app.get("/api/news", async (req, res) => {
    try {
        const [result] = await db.query("SELECT * FROM news ORDER BY id DESC");
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching news" });
    }
});

// ======================================================
// GET SINGLE NEWS
// ======================================================
app.get("/api/news/:id", async (req, res) => {
    const newsId = req.params.id;
    try {
        const [result] = await db.query("SELECT * FROM news WHERE id=?", [newsId]);

        if (result.length === 0) {
            return res.status(404).json({ message: "News not found" });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({ message: "Error fetching news" });
    }
});

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

// ======================================================
// GET CATEGORIES
// ======================================================
app.get("/api/categories", async (req, res) => {
    try {
        const [result] = await db.query("SELECT * FROM categories");
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching categories" });
    }
});

// ======================================================
// START SERVER
// ======================================================
app.listen(4003, () => {
    console.log("Server is running on port 4003");
});
