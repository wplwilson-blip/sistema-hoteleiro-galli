# -*- coding: utf-8 -*-
"""
Conferencia de sintaxe de migration ANTES de entregar (plano docs/codex/74, §8).

POR QUE ISTO EXISTE: foi assim que a 089 quebrou na mao do Wilson -- uma quebra de linha
real dentro de um literal `'...'` fez a linha seguinte virar SQL solto, e o arquivo inteiro
falhou com 42601 no SQL Editor. Um arquivo de migration so' e' lido por uma maquina depois
que alguem cola ele num editor de producao.

AS TRES CONFERENCIAS DA §8:
  1. blocos com aspas de cifrao ($$ e $TAG$) BALANCEADOS;
  2. nenhum literal de aspas simples atravessando quebra de linha em nivel de topo;
  3. nenhuma linha EXECUTAVEL depois do ultimo `grant`.

DUAS VERSOES ANTERIORES DESTE CHECK DERAM ALARME FALSO, e por isso ele e' um TOKENIZADOR:
  - contar aspas por linha reprovava a 089 (boa): comentario em portugues tem `so'` e `e'`;
  - contar a substring `$` reprovava a 091 (boa): tag nomeada ($OPENDAY$) tem `$` artificial.

Por isso todo arquivo conhecidamente BOM entra como CONTROLE POSITIVO: se o proprio check
reprovar uma migration que esta' aplicada em producao, o defeito e' do check.

Uso:
    python scripts/codex/check-sql-syntax.py supabase/migrations/093_*.sql
"""
import glob
import io
import sys

# Migrations aplicadas e validadas nos dois bancos. Se o check reprovar uma delas, ELE
# esta' errado -- nao ela.
CONTROLES = sorted(
    glob.glob("supabase/migrations/089_*.sql")
    + glob.glob("supabase/migrations/090_*.sql")
    + glob.glob("supabase/migrations/091_*.sql")
    + glob.glob("supabase/migrations/092_*.sql")
)


def tokenizar(texto):
    """
    Percorre o SQL caractere a caractere devolvendo (falhas, linhas_executaveis).

    Estados: codigo, comentario de linha, comentario de bloco, literal de aspas simples,
    e bloco com aspas de cifrao (com tag). E' o unico jeito honesto de saber se uma aspa
    esta' "dentro" ou "fora" -- que e' exatamente o que as duas versoes anteriores erraram.
    """
    falhas = []
    executaveis = []

    i = 0
    linha = 1
    n = len(texto)
    profundidade_cifrao = 0
    tag_cifrao = None
    inicio_bloco = 0
    linha_tem_codigo = False

    while i < n:
        c = texto[i]

        if c == "\n":
            if linha_tem_codigo:
                executaveis.append(linha)
            linha_tem_codigo = False
            linha += 1
            i += 1
            continue

        # ---------------------------------------------------------- comentarios
        #
        # SEM a guarda de `tag_cifrao`, e isto e' o ponto: dentro de um corpo PL/pgSQL o
        # `--` TAMBEM e' comentario. Tratar o corpo como texto opaco fazia cada `so'` e cada
        # `e'` de comentario em portugues abrir um literal fantasma -- e foi assim que os
        # controles positivos reprovaram a primeira versao deste script.
        if texto.startswith("--", i):
            fim = texto.find("\n", i)
            i = n if fim == -1 else fim
            continue

        if texto.startswith("/*", i):
            fim = texto.find("*/", i + 2)
            if fim == -1:
                falhas.append("linha %d: comentario de bloco /* sem fechamento" % linha)
                break
            linha += texto.count("\n", i, fim)
            i = fim + 2
            continue

        # ---------------------------------------------------------- aspas de cifrao
        if c == "$":
            fim_tag = texto.find("$", i + 1)
            candidata = texto[i : fim_tag + 1] if fim_tag != -1 else ""
            miolo = candidata[1:-1]

            # `$$` ou `$IDENTIFICADOR$`. Qualquer outra coisa e' um `$` comum.
            if candidata and (miolo == "" or miolo.replace("_", "").isalnum()):
                if tag_cifrao is None:
                    tag_cifrao = candidata
                    inicio_bloco = linha
                    profundidade_cifrao += 1
                elif candidata == tag_cifrao:
                    tag_cifrao = None
                    profundidade_cifrao -= 1
                linha_tem_codigo = True
                i = fim_tag + 1
                continue

        # ---------------------------------------------------------- literal de aspas simples
        if c == "'":
            j = i + 1
            while j < n:
                if texto[j] == "'":
                    if j + 1 < n and texto[j + 1] == "'":
                        j += 2
                        continue
                    break
                if texto[j] == "\n" and tag_cifrao is None:
                    # A FALHA DA 089, exatamente: literal aberto e nao fechado na mesma
                    # linha. A linha seguinte vira SQL solto.
                    falhas.append("linha %d: literal ' atravessa quebra de linha" % linha)
                    break
                j += 1
            else:
                falhas.append("linha %d: literal ' sem fechamento ate' o fim do arquivo" % linha)
                break

            if falhas:
                break

            linha += texto.count("\n", i, j)
            linha_tem_codigo = True
            i = j + 1
            continue

        if not c.isspace():
            linha_tem_codigo = True

        i += 1

    if linha_tem_codigo:
        executaveis.append(linha)

    if tag_cifrao is not None:
        falhas.append(
            "bloco de aspas de cifrao %s aberto na linha %d nunca fecha" % (tag_cifrao, inicio_bloco)
        )
    elif profundidade_cifrao != 0:
        falhas.append("blocos de aspas de cifrao desbalanceados (%d)" % profundidade_cifrao)

    return falhas, executaveis


def conferir(caminho):
    texto = io.open(caminho, encoding="utf-8").read()
    falhas, executaveis = tokenizar(texto)

    # 3) nada executavel depois do ultimo `grant`.
    ultimo_grant = 0
    for numero, conteudo in enumerate(texto.split("\n"), start=1):
        despido = conteudo.strip().lower()
        if despido.startswith("grant ") or despido.startswith("revoke "):
            ultimo_grant = numero

    if ultimo_grant:
        depois = [linha for linha in executaveis if linha > ultimo_grant]
        if depois:
            falhas.append(
                "linhas executaveis depois do ultimo grant/revoke (linha %d): %s"
                % (ultimo_grant, depois[:5])
            )

    return falhas


def main():
    alvos = sys.argv[1:]

    if not alvos:
        sys.exit("uso: check-sql-syntax.py <arquivo.sql> [...]")

    print("CONTROLES POSITIVOS (aplicados em producao -- tem que passar):")
    controle_falhou = False

    for caminho in CONTROLES:
        falhas = conferir(caminho)
        print("  %-58s %s" % (caminho, "ok" if not falhas else "REPROVOU"))
        for falha in falhas:
            print("      " + falha)
            controle_falhou = True

    if controle_falhou:
        sys.exit("\nO CHECK ESTA ERRADO, nao a migration: um controle positivo reprovou.")

    print("\nALVOS:")
    houve_falha = False

    for caminho in alvos:
        falhas = conferir(caminho)
        print("  %-58s %s" % (caminho, "ok" if not falhas else "REPROVOU"))
        for falha in falhas:
            print("      " + falha)
            houve_falha = True

    if houve_falha:
        sys.exit(1)

    print("\nTres conferencias da §8 do plano 74: passaram.")


if __name__ == "__main__":
    main()
