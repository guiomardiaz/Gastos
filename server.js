import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from "@mui/material";

import { obtenerInformeGanancias } from "../../../services/extrasService";
import { generarInformeGanancias } from "../../../utils/generarInformeGanancias";

const PURPLE = "#7C4DCC";
const PINK = "#EC4899";

const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmt = (f) => (f ? f.split("-").reverse().join("/") : "");
const euros = (n) => `${Number(n || 0).toFixed(2).replace(".", ",")} €`;

function rangoRapido(tipo) {
    const hoy = new Date();
    const desde = new Date(hoy);
    const hasta = new Date(hoy);

    if (tipo === "hoy") {
        // hoy
    } else if (tipo === "semana") {
        const dia = (hoy.getDay() + 6) % 7; // lunes = 0
        desde.setDate(hoy.getDate() - dia);
        hasta.setDate(desde.getDate() + 6);
    } else if (tipo === "mes") {
        desde.setDate(1);
        hasta.setMonth(hoy.getMonth() + 1, 0);
    } else if (tipo === "30") {
        desde.setDate(hoy.getDate() - 29);
    }
    return { desde: iso(desde), hasta: iso(hasta) };
}

export default function InformeGananciasDialog({ open, onClose }) {

    const inicial = rangoRapido("mes");
    const [desde, setDesde] = useState(inicial.desde);
    const [hasta, setHasta] = useState(inicial.hasta);
    const [informe, setInforme] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState("");

    async function generar(d = desde, h = hasta) {
        if (!d || !h) {
            setError("Elige las dos fechas.");
            return;
        }
        if (h < d) {
            setError("La fecha final no puede ser anterior a la inicial.");
            return;
        }
        setError("");
        setCargando(true);
        try {
            setInforme(await obtenerInformeGanancias(d, h));
        } catch {
            setError("No se pudo generar el informe.");
        } finally {
            setCargando(false);
        }
    }

    function aplicarRapido(tipo) {
        const r = rangoRapido(tipo);
        setDesde(r.desde);
        setHasta(r.hasta);
        generar(r.desde, r.hasta);
    }

    const fecha = { inputLabel: { shrink: true } };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ fontWeight: 800 }}>📊 Informe de ganancias</DialogTitle>

            <DialogContent>
                <Box sx={{ display: "grid", gap: 2, pt: 1 }}>

                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        {[
                            ["hoy", "Hoy"],
                            ["semana", "Esta semana"],
                            ["mes", "Este mes"],
                            ["30", "Últimos 30 días"],
                        ].map(([k, t]) => (
                            <Chip key={k} label={t} onClick={() => aplicarRapido(k)} clickable />
                        ))}
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" }, gap: 2, alignItems: "center" }}>
                        <TextField
                            label="Desde" type="date" value={desde}
                            onChange={(e) => setDesde(e.target.value)} slotProps={fecha}
                        />
                        <TextField
                            label="Hasta" type="date" value={hasta}
                            onChange={(e) => setHasta(e.target.value)} slotProps={fecha}
                        />
                        <Button
                            variant="contained"
                            onClick={() => generar()}
                            disabled={cargando}
                            sx={{ minHeight: 54, textTransform: "none", fontWeight: 700, bgcolor: PINK, "&:hover": { bgcolor: "#DB2777" } }}
                        >
                            Generar
                        </Button>
                    </Box>

                    {error && <Alert severity="error">{error}</Alert>}

                    {cargando && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                            <CircularProgress />
                        </Box>
                    )}

                    {informe && !cargando && (
                        <>
                            {informe.datosIncompletos && (
                                <Alert severity="info">
                                    Solo se conservan los datos de los últimos 30 días
                                    (desde el {fmt(informe.conservadoDesde)}); lo anterior se borra automáticamente.
                                </Alert>
                            )}

                            <Box
                                sx={{
                                    p: 2.5,
                                    borderRadius: 3,
                                    background: "linear-gradient(135deg,#F1EAFE,#FCE7F3)",
                                    border: "1px solid #E7DDF7",
                                }}
                            >
                                <Typography sx={{ fontSize: "0.8rem", color: "#777384" }}>
                                    Del {fmt(informe.desde)} al {fmt(informe.hasta)}
                                </Typography>
                                <Typography sx={{ fontSize: "2rem", fontWeight: 800, color: PURPLE }}>
                                    {euros(informe.total)}
                                </Typography>
                                <Typography sx={{ fontSize: "0.85rem", color: "#555" }}>
                                    {informe.totalServicios} servicio{informe.totalServicios === 1 ? "" : "s"} · {informe.perros.length} perro{informe.perros.length === 1 ? "" : "s"}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                                    {Object.entries(informe.porServicio).map(([nombre, valor]) => (
                                        <Chip key={nombre} size="small" label={`${nombre}: ${euros(valor)}`} sx={{ bgcolor: "#fff", fontWeight: 700 }} />
                                    ))}
                                </Box>
                            </Box>

                            {informe.perros.length > 0 && (
                                <Box>
                                    <Typography sx={{ fontWeight: 800, mb: 1 }}>🐶 Por perro</Typography>
                                    <Box sx={{ display: "grid", gap: 0.8 }}>
                                        {informe.perros.map((p) => (
                                            <Box
                                                key={p.perro}
                                                sx={{ display: "flex", justifyContent: "space-between", p: 1.2, borderRadius: 2, bgcolor: "#FAF8FF", border: "1px solid #EEE9F5" }}
                                            >
                                                <Typography sx={{ fontWeight: 700 }}>
                                                    {p.perro}
                                                    <Typography component="span" sx={{ color: "#777384", fontSize: "0.8rem", ml: 1 }}>
                                                        {p.dias} día{p.dias === 1 ? "" : "s"}
                                                    </Typography>
                                                </Typography>
                                                <Typography sx={{ fontWeight: 800, color: PURPLE }}>{euros(p.total)}</Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {informe.dias.length > 0 && (
                                <Box>
                                    <Typography sx={{ fontWeight: 800, mb: 1 }}>📅 Por día</Typography>
                                    <Box sx={{ display: "grid", gap: 1 }}>
                                        {informe.dias.map((d) => (
                                            <Box key={d.fecha} sx={{ p: 1.5, borderRadius: 2.5, border: "1px solid #EEE9F5" }}>
                                                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                                    <Typography sx={{ fontWeight: 800 }}>{fmt(d.fecha)}</Typography>
                                                    <Typography sx={{ fontWeight: 800, color: PURPLE }}>{euros(d.total)}</Typography>
                                                </Box>
                                                {d.lineas.map((l, i) => (
                                                    <Typography key={i} sx={{ fontSize: "0.82rem", color: "#555", mt: 0.3 }}>
                                                        🐶 {l.perros || "—"} · {l.servicio} · {euros(l.importe)}
                                                    </Typography>
                                                ))}
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {informe.dias.length === 0 && (
                                <Typography sx={{ color: "#777384", textAlign: "center", py: 2 }}>
                                    No hay servicios registrados en estas fechas.
                                </Typography>
                            )}
                        </>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                {informe && (
                    <Button
                        onClick={() => generarInformeGanancias(informe)}
                        sx={{ textTransform: "none", fontWeight: 700, mr: "auto" }}
                    >
                        📄 Descargar PDF
                    </Button>
                )}
                <Button onClick={onClose}>Cerrar</Button>
            </DialogActions>
        </Dialog>
    );
}