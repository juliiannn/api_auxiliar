-- =====================================================================
-- Base de datos AUXILIAR (MySQL) - Apoyos visuales con pictogramas (autismo, TDAH)
-- Complementa a la base principal (PostgreSQL). No hay llaves foráneas entre ambas:
-- el estudiante se referencia por su correo (claim "sub" del JWT).
--
-- Los pictogramas se obtienen del servicio externo ARASAAC (https://arasaac.org) y se guardan aquí.
--
-- Todas las tablas tienen:
--   id           llave primaria
--   estado       1 = activo, 0 = eliminado (borrado lógico; el registro no se borra)
--   creado       fecha de creación (la asigna el motor, no cambia)
--   actualizado  fecha de la última modificación (la actualiza el motor en cada UPDATE)
-- =====================================================================

-- En un hosting en la nube la base ya viene creada: omite estas dos líneas y usa la que te den.
-- CREATE DATABASE IF NOT EXISTS colegio_aux CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE colegio_aux;

-- ===== 1. Pictogramas (catálogo guardado del servicio externo ARASAAC) =====
CREATE TABLE pictograms (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    arasaac_id INT UNSIGNED NOT NULL,              -- id del pictograma en ARASAAC
    palabra VARCHAR(100) NOT NULL,                 -- palabra principal
    palabras_clave VARCHAR(500) NULL,
    imagen_url VARCHAR(255) NOT NULL,
    fuente VARCHAR(50) NOT NULL DEFAULT 'arasaac.org',
    estado TINYINT(1) NOT NULL DEFAULT 1,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_pictograms_arasaac UNIQUE (arasaac_id),
    INDEX idx_pictograms_palabra (palabra)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 2. Apoyos visuales (agendas, rutinas, tareas por pasos...) =====
CREATE TABLE visual_supports (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(40) NOT NULL,
    tipo ENUM('AGENDA_DIA', 'RUTINA', 'TAREA_PASOS', 'ANTICIPACION', 'NORMAS') NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500) NULL,
    estudiante_email VARCHAR(255) NULL,            -- NULL = apoyo general del aula (lo ven todos los estudiantes)
    creado_por VARCHAR(255) NOT NULL,              -- correo de quien lo creó
    estado TINYINT(1) NOT NULL DEFAULT 1,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_visual_supports_codigo UNIQUE (codigo),
    INDEX idx_visual_supports_estudiante (estudiante_email),
    INDEX idx_visual_supports_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 3. Pasos de cada apoyo visual =====
CREATE TABLE visual_support_steps (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    support_id INT UNSIGNED NOT NULL,
    orden SMALLINT UNSIGNED NOT NULL,
    texto VARCHAR(200) NOT NULL,
    pictograma_id INT UNSIGNED NULL,
    duracion_minutos SMALLINT UNSIGNED NULL,       -- tiempo sugerido (útil para organizar el tiempo en TDAH)
    estado TINYINT(1) NOT NULL DEFAULT 1,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_visual_support_steps_orden UNIQUE (support_id, orden),
    CONSTRAINT fk_steps_support FOREIGN KEY (support_id) REFERENCES visual_supports (id),
    CONSTRAINT fk_steps_pictogram FOREIGN KEY (pictograma_id) REFERENCES pictograms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 4. Auditoría de acciones (quién consultó o modificó apoyos de un estudiante) =====
CREATE TABLE audit_logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid CHAR(36) NOT NULL,
    usuario_email VARCHAR(255) NOT NULL,
    rol VARCHAR(30) NULL,
    accion ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'OTHER') NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    recurso_id VARCHAR(50) NULL,
    detalle TEXT NULL,
    ip VARCHAR(45) NULL,
    estado TINYINT(1) NOT NULL DEFAULT 1,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_audit_logs_uuid UNIQUE (uuid),
    INDEX idx_audit_logs_usuario (usuario_email),
    INDEX idx_audit_logs_modulo (modulo),
    INDEX idx_audit_logs_creado (creado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los pictogramas se guardan solos cuando se buscan (GET /pictograms/search). No hay datos iniciales que insertar.
