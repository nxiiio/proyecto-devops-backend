const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3001;

const {
  DB_HOST = "db",
  DB_USER = "root",
  DB_PASSWORD = "admin123",
  DB_NAME = "tienda_perritos",
  DB_PORT = 3306,
  DB_RETRY_ATTEMPTS = 30,
  DB_RETRY_DELAY_MS = 2000,
} = process.env;

app.use(cors());
app.use(express.json());

let pool;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Inicializar pool de conexiones
async function initDb() {
  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: Number(DB_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  for (let attempt = 1; attempt <= Number(DB_RETRY_ATTEMPTS); attempt += 1) {
    try {
      const connection = await pool.getConnection();
      await connection.query("SELECT 1");
      connection.release();
      console.log("Conexión MySQL verificada.");
      return;
    } catch (err) {
      if (attempt === Number(DB_RETRY_ATTEMPTS)) {
        throw err;
      }

      console.warn(
        `MySQL no disponible todavía (${attempt}/${DB_RETRY_ATTEMPTS}). Reintentando en ${DB_RETRY_DELAY_MS}ms...`
      );
      await delay(Number(DB_RETRY_DELAY_MS));
    }
  }
}

// Helper para manejar errores
function handleError(res, error, message = "Error interno del servidor") {
  console.error(error);
  res.status(500).json({ message });
}

// Obtener todos los productos
app.get("/api/productos", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    handleError(res, err, "No se pudieron obtener los productos.");
  }
});

// Obtener un producto por ID
app.get("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo obtener el producto.");
  }
});

// Crear un nuevo producto
app.post("/api/productos", async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, precio y stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO productos (nombre, descripcion, precio, stock) VALUES (?, ?, ?, ?)",
      [nombre, descripcion || null, precio, stock]
    );
    const nuevoId = result.insertId;
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [nuevoId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo crear el producto.");
  }
});

// Actualizar un producto
app.put("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, precio y stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ? WHERE id = ?",
      [nombre, descripcion || null, precio, stock, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [id]);
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo actualizar el producto.");
  }
});

// Eliminar un producto
app.delete("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json({ message: "Producto eliminado correctamente." });
  } catch (err) {
    handleError(res, err, "No se pudo eliminar el producto.");
  }
});

// Endpoint de salud
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend de tienda de perritos en ejecución." });
});

// Iniciar servidor solo cuando MySQL esté disponible
async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Servidor backend escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error("No se pudo conectar a MySQL. Backend detenido:", err);
    process.exit(1);
  }
}

startServer();
